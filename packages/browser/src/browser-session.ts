import { CaptureRouter, createRgbaFrame, sdkError, type ConcurrentCallPolicy, type ScanFailure, type ScanOutcome } from "@scanly/core";
import { getBuiltinScenario, validateScenario, type ScenarioDefinition } from "@scanly/scenario-schema";
import { loadPixelBufferFromFile } from "./image-loader.js";
import { createBrowserCaptureRouter } from "./runtime.js";
import { DecodeWorkerClient, markDecodePath, type DecodeWorkerFactory, type WorkerScanOptions } from "./worker/worker-client.js";

export type BrowserCaptureSessionState = "idle" | "initialized" | "running" | "stopped" | "disposed";
export interface BrowserScanFileOptions extends WorkerScanOptions { forceMainThread?: boolean }
export interface BrowserCaptureSessionOptions {
  scenario?: ScenarioDefinition;
  concurrentCallPolicy?: ConcurrentCallPolicy;
  workerFactory?: DecodeWorkerFactory;
  router?: CaptureRouter;
  disposeRouter?: boolean;
}

let browserFrameSequence = 0;

export class BrowserCaptureSession {
  private state: BrowserCaptureSessionState = "idle";
  private scenario: ScenarioDefinition;
  private readonly concurrentPolicy: ConcurrentCallPolicy;
  private readonly worker: DecodeWorkerClient;
  private readonly router: CaptureRouter;
  private readonly ownsRouter: boolean;
  private controller: AbortController | null = null;
  private owner = 0;

  constructor(options: BrowserCaptureSessionOptions = {}) {
    const validation = validateScenario(options.scenario ?? getBuiltinScenario("balanced"));
    if (!validation.ok) throw Object.assign(new Error(validation.message), { code: "malformed_scenario", issues: validation.issues });
    this.scenario = validation.value;
    this.concurrentPolicy = options.concurrentCallPolicy ?? "replace";
    this.worker = new DecodeWorkerClient(options.workerFactory);
    this.router = options.router ?? createBrowserCaptureRouter({ scenario: this.scenario });
    this.ownsRouter = options.disposeRouter ?? !options.router;
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
    this.router.updateScenario(validation.value);
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
      options.onStage?.("Loading image...");
      const pixels = await loadPixelBufferFromFile(file);
      if (controller.signal.aborted) return this.failure(frameId, "cancelled", "Decode cancelled.");
      const workerPath = !options.forceMainThread && typeof Worker !== "undefined";
      const frame = createRgbaFrame(pixels.data, pixels.width, pixels.height, { id: frameId, sourceType: "upload", ownership: workerPath ? "transferred" : "owned" });
      let outcome: ScanOutcome;
      if (workerPath) {
        markDecodePath("worker");
        outcome = await this.worker.scan(frame, this.scenario, { signal: controller.signal, onStage: options.onStage, onProgress: options.onProgress });
      } else {
        markDecodePath("main-thread");
        options.onStage?.("Routing normalized frame...");
        outcome = await this.router.scan(frame, { signal: controller.signal, scenario: this.scenario });
        options.onProgress?.({ attemptCount: outcome.attemptCount });
      }
      if (owner !== this.owner) return this.failure(frameId, "cancelled", "Result belongs to a superseded browser job.");
      return outcome;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "unsupported_image";
      const mapped = code === "image_too_large" ? "resource_limit_exceeded" : code === "invalid_file" || code === "unsupported_image" || code === "empty_image" || code === "invalid_image" ? "invalid_image" : controller.signal.aborted ? "cancelled" : "engine_execution_failure";
      return this.failure(frameId, mapped, error instanceof Error ? error.message : String(error));
    } finally {
      options.signal?.removeEventListener("abort", onAbort);
      if (this.controller === controller) this.controller = null;
    }
  }

  async dispose(): Promise<void> {
    if (this.state === "disposed") return;
    this.cancel();
    this.worker.dispose();
    this.state = "disposed";
    if (this.ownsRouter) await this.router.dispose();
  }

  private assertNotDisposed(): void { if (this.state === "disposed") throw Object.assign(new Error("Browser capture session has been disposed."), { code: "session_disposed" }); }
  private failure(frameId: string, code: "session_not_running" | "session_disposed" | "concurrent_call_rejected" | "cancelled" | "invalid_image" | "resource_limit_exceeded" | "engine_execution_failure", message: string): ScanFailure {
    return { ok: false, error: sdkError(code, message), frameId, scenarioId: this.scenario.id, attemptCount: 0, timing: { totalMs: 0 } };
  }
}
