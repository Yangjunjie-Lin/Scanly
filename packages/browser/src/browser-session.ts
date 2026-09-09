import { CaptureRouter, IndustrialRecoveryPipeline, createRecoveryProbeScenario, createRgbaFrame, normalizeFormatSelection, sdkError, type BarcodeFormat, type ConcurrentCallPolicy, type FormatSelection, type RecoveryBudget, type RecoveryProfile, type RecoveryRouteId, type ScanFailure, type ScanOutcome } from "@scanly/core";
import { getBuiltinScenario, validateScenario, type ScenarioDefinition } from "@scanly/scenario-schema";
import { loadPixelBufferFromFile } from "./image-loader.js";
import { createBrowserCaptureRouter } from "./runtime.js";
import { DecodeWorkerClient, markDecodePath, type DecodeWorkerFactory, type WorkerScanOptions } from "./worker/worker-client.js";

export type BrowserCaptureSessionState = "idle" | "initialized" | "running" | "stopped" | "disposed";
export interface BrowserScanFileOptions extends WorkerScanOptions { forceMainThread?: boolean }
export interface BrowserCaptureSessionOptions {
  scenario?: ScenarioDefinition;
  formats?: FormatSelection | readonly BarcodeFormat[];
  concurrentCallPolicy?: ConcurrentCallPolicy;
  workerFactory?: DecodeWorkerFactory;
  router?: CaptureRouter;
  disposeRouter?: boolean;
  /** Static industrial recovery is explicit; normal upload behavior is unchanged. */
  recovery?: false | BrowserStaticIndustrialRecoveryOptions;
}

export interface BrowserStaticIndustrialRecoveryOptions {
  profile?: RecoveryProfile;
  budget?: RecoveryBudget;
  dpmExperimental?: boolean;
  excludedRoutes?: readonly RecoveryRouteId[];
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
  private recovery: false | BrowserStaticIndustrialRecoveryOptions;
  private readonly recoveryPipeline = new IndustrialRecoveryPipeline();

  constructor(options: BrowserCaptureSessionOptions = {}) {
    const initial = options.scenario ?? getBuiltinScenario("balanced");
    const configured = options.formats ? { ...initial, acceptedFormats: [...normalizeFormatSelection(options.formats).formats] } : initial;
    const validation = validateScenario(configured);
    if (!validation.ok) throw Object.assign(new Error(validation.message), { code: "malformed_scenario", issues: validation.issues });
    this.scenario = validation.value;
    this.concurrentPolicy = options.concurrentCallPolicy ?? "replace";
    this.worker = new DecodeWorkerClient(options.workerFactory);
    this.router = options.router ?? createBrowserCaptureRouter({ scenario: this.scenario });
    this.ownsRouter = options.disposeRouter ?? !options.router;
    this.recovery = options.recovery ?? false;
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

  updateFormats(selection: FormatSelection | readonly BarcodeFormat[]): void {
    const formats = normalizeFormatSelection(selection).formats;
    this.updateConfiguration({ ...this.scenario, acceptedFormats: [...formats] });
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
    if (options.signal?.aborted) controller.abort();
    try {
      if (controller.signal.aborted) return this.failure(frameId, "cancelled", "Decode cancelled before image loading.");
      options.onStage?.("Loading image...");
      const pixels = await loadPixelBufferFromFile(file);
      if (controller.signal.aborted) return this.failure(frameId, "cancelled", "Decode cancelled.");
      const workerPath = !options.forceMainThread && typeof Worker !== "undefined";
      const frame = createRgbaFrame(pixels.data, pixels.width, pixels.height, { id: frameId, sourceType: "upload", ownership: workerPath ? "transferred" : "owned" });
      let outcome: ScanOutcome;
      if (workerPath) {
        const decodeStartedAt = Date.now();
        const scenario = this.scenario;
        markDecodePath("worker");
        outcome = await this.worker.scan(frame, scenario, { signal: controller.signal, preserveSourceForFallback: true, onStage: options.onStage, onProgress: options.onProgress, ...(this.workerRecovery() ? { recovery: this.workerRecovery()! } : {}) });
        if (!outcome.ok && ["worker_initialization_failure", "engine_execution_failure"].includes(outcome.error.code) && !controller.signal.aborted && owner === this.owner) {
          const workerOutcome = outcome;
          const workerElapsedMs = Math.max(Date.now() - decodeStartedAt, workerOutcome.timing.totalMs);
          const remainingExecutionMs = Math.floor(scenario.budgets.maxExecutionMs - workerElapsedMs);
          const remainingAttempts = scenario.budgets.maxAttempts - workerOutcome.attemptCount;
          if (remainingExecutionMs > 0 && remainingAttempts > 0) {
            markDecodePath("main-thread");
            options.onStage?.("Worker unavailable; retrying on main thread within the remaining scan budget...");
            const fallbackScenario: ScenarioDefinition = {
              ...scenario,
              multiCode: { ...scenario.multiCode, maxResults: Math.min(scenario.multiCode.maxResults, remainingAttempts) },
              budgets: { ...scenario.budgets, maxAttempts: remainingAttempts, maxExecutionMs: remainingExecutionMs },
            };
            const fallback = await this.decodeOnMain(
              createRgbaFrame(pixels.data, pixels.width, pixels.height, { id: frameId, sourceType: "upload", ownership: "owned" }),
              fallbackScenario,
              controller.signal,
            );
            const totalMs = Math.max(Date.now() - decodeStartedAt, workerElapsedMs + fallback.timing.totalMs);
            outcome = {
              ...fallback,
              attemptCount: workerOutcome.attemptCount + fallback.attemptCount,
              timing: {
                ...fallback.timing,
                totalMs,
                ...(workerOutcome.timing.workerSetupMs === undefined ? {} : { workerSetupMs: workerOutcome.timing.workerSetupMs }),
                ...(workerOutcome.timing.workerTransferMs === undefined ? {} : { workerTransferMs: workerOutcome.timing.workerTransferMs }),
              },
            };
            options.onProgress?.({ attemptCount: outcome.attemptCount });
          }
        }
      } else {
        markDecodePath("main-thread");
        options.onStage?.("Routing normalized frame...");
        outcome = await this.decodeOnMain(frame, this.scenario, controller.signal);
        options.onProgress?.({ attemptCount: outcome.attemptCount });
      }
      if (controller.signal.aborted) return this.failure(frameId, "cancelled", "Decode cancelled.");
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

  updateRecovery(recovery: false | BrowserStaticIndustrialRecoveryOptions): void {
    this.assertNotDisposed();
    this.cancel();
    this.recovery = recovery;
  }

  private workerRecovery() {
    if (this.recovery === false) return undefined;
    const profile = this.recovery.profile ?? "industrial";
    return {
      profile,
      sourceMode: "static" as const,
      ...(this.recovery.budget ? { budget: this.recovery.budget } : {}),
      dpmExperimental: this.recovery.dpmExperimental === true || profile === "dpm-experimental",
      ...(this.recovery.excludedRoutes ? { excludedRoutes: [...this.recovery.excludedRoutes] } : {}),
    };
  }

  private async decodeOnMain(frame: import("@scanly/core").NormalizedFrame, scenario: ScenarioDefinition, signal: AbortSignal): Promise<ScanOutcome> {
    const recovery = this.workerRecovery();
    if (!recovery) return this.router.scan(frame, { signal, scenario });
    return (await this.recoveryPipeline.run(frame, (candidate, request) => this.router.scan(
      { ...candidate, ownership: "borrowed", dispose: undefined },
      { signal: request.signal, scenario: request.routeId === "general" ? scenario : createRecoveryProbeScenario(scenario, request.routeId) },
    ), { profile: recovery.profile, sourceMode: "static", ...(recovery.budget ? { budget: recovery.budget } : {}), signal, dpmExperimental: recovery.dpmExperimental, excludedRoutes: recovery.excludedRoutes })).outcome;
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
