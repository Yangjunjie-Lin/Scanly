import {
  mapLegacyQrOutcome,
  scenarioToPipelineConfig,
  sdkError,
  type ConcurrentCallPolicy,
  type ScanFailure,
  type ScanOutcome,
} from "@scanly/core";
import { getBuiltinScenario, validateScenario, type ScenarioDefinition } from "@scanly/scenario-schema";
import { decodePixelBuffer, type DecodeFailure, type DecodePipelineOptions, type DecodeOutcome } from "@scanly/core/qr";
import { loadPixelBufferFromFile } from "./image-loader.js";
import { DecodeWorkerClient, markDecodePath, type DecodeWorkerFactory } from "./worker/worker-client.js";

export type BrowserCaptureSessionState = "idle" | "initialized" | "running" | "stopped" | "disposed";
export interface BrowserScanFileOptions {
  signal?: AbortSignal;
  onStage?: DecodePipelineOptions["onStage"];
  onProgress?: DecodePipelineOptions["onProgress"];
  forceMainThread?: boolean;
}
export interface BrowserCaptureSessionOptions {
  scenario?: ScenarioDefinition;
  concurrentCallPolicy?: ConcurrentCallPolicy;
  workerFactory?: DecodeWorkerFactory;
}

function legacyFailure(reason: DecodeFailure["reason"], message: string): DecodeOutcome {
  return { ok: false, reason, message, attempts: [], attemptCount: 0, elapsedMs: 0, cancelled: reason === "cancelled" };
}

function inputFailure(error: unknown): DecodeOutcome {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code: string }).code) : "unsupported_image";
  const reason: DecodeFailure["reason"] =
    code === "invalid_file" || code === "unsupported_image" || code === "empty_image" || code === "image_too_large" || code === "invalid_image" || code === "invalid_configuration"
      ? code
      : "unsupported_image";
  return legacyFailure(reason, error instanceof Error ? error.message : String(error));
}

let browserFrameSequence = 0;

export class BrowserCaptureSession {
  private state: BrowserCaptureSessionState = "idle";
  private scenario: ScenarioDefinition;
  private readonly concurrentPolicy: ConcurrentCallPolicy;
  private readonly worker: DecodeWorkerClient;
  private controller: AbortController | null = null;
  private owner = 0;
  constructor(options: BrowserCaptureSessionOptions = {}) {
    const validation = validateScenario(options.scenario ?? getBuiltinScenario("balanced"));
    if (!validation.ok) throw Object.assign(new Error(validation.message), { code: "malformed_scenario", issues: validation.issues });
    this.scenario = validation.value;
    this.concurrentPolicy = options.concurrentCallPolicy ?? "replace";
    this.worker = new DecodeWorkerClient(options.workerFactory);
  }
  getState(): BrowserCaptureSessionState { return this.state; }
  initialize(): void { this.assertNotDisposed(); if (this.state === "idle" || this.state === "stopped") this.state = "initialized"; }
  start(): void { this.assertNotDisposed(); if (this.state === "idle") this.initialize(); this.state = "running"; }
  stop(): void { if (this.state === "disposed") return; this.cancel(); this.state = "stopped"; }
  cancel(): void { this.owner += 1; this.controller?.abort(); this.controller = null; this.worker.cancel(); }
  updateConfiguration(scenario: ScenarioDefinition): void {
    this.assertNotDisposed();
    const validation = validateScenario(scenario);
    if (!validation.ok) throw Object.assign(new Error(validation.message), { code: "malformed_scenario", issues: validation.issues });
    this.cancel();
    this.scenario = validation.value;
  }
  async scanFile(file: File, options: BrowserScanFileOptions = {}): Promise<ScanOutcome> {
    const frameId = `browser-frame-${Date.now()}-${++browserFrameSequence}`;
    if (this.state === "disposed") return this.failure(frameId, "session_disposed", "Browser capture session has been disposed.");
    if (this.state !== "running") return this.failure(frameId, "session_not_running", "Browser capture session must be started before scanFile().");
    if (this.controller && this.concurrentPolicy === "reject") return this.failure(frameId, "concurrent_call_rejected", "This session allows one active scan.");
    if (this.controller) this.cancel();
    const owner = ++this.owner;
    const controller = new AbortController();
    this.controller = controller;
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      options.onStage?.("Loading image…");
      const pixels = await loadPixelBufferFromFile(file);
      if (controller.signal.aborted) return mapLegacyQrOutcome(frameId, this.scenario, legacyFailure("cancelled", "Decode cancelled."));
      let outcome: DecodeOutcome;
      if (options.forceMainThread || typeof Worker === "undefined") {
        markDecodePath("main-thread");
        outcome = await decodePixelBuffer(pixels, { signal: controller.signal, config: scenarioToPipelineConfig(this.scenario), onStage: options.onStage, onProgress: options.onProgress });
      } else {
        markDecodePath("worker");
        outcome = await this.worker.decode(pixels, { signal: controller.signal, config: scenarioToPipelineConfig(this.scenario), onStage: options.onStage, onProgress: options.onProgress });
      }
      if (owner !== this.owner) return mapLegacyQrOutcome(frameId, this.scenario, legacyFailure("cancelled", "Result belongs to a superseded browser job."));
      return mapLegacyQrOutcome(frameId, this.scenario, outcome);
    } catch (error) {
      return mapLegacyQrOutcome(frameId, this.scenario, inputFailure(error));
    } finally {
      options.signal?.removeEventListener("abort", onAbort);
      if (this.controller === controller) this.controller = null;
    }
  }
  dispose(): void { if (this.state === "disposed") return; this.cancel(); this.worker.dispose(); this.state = "disposed"; }
  private assertNotDisposed(): void {
    if (this.state === "disposed") throw Object.assign(new Error("Browser capture session has been disposed."), { code: "session_disposed" });
  }
  private failure(frameId: string, code: "session_not_running" | "session_disposed" | "concurrent_call_rejected", message: string): ScanFailure {
    return { ok: false, error: sdkError(code, message), frameId, scenarioId: this.scenario.id, attemptCount: 0, timing: { totalMs: 0 } };
  }
}
