import { validateScenario, type ScenarioDefinition } from "@scanly/scenario-schema";
import { SdkException, sdkError } from "../contracts/errors.js";
import type { FrameSourceType, NormalizedFrame } from "../contracts/frame.js";
import type { ScanFailure, ScanOutcome } from "../contracts/result.js";
import { CaptureRouter } from "./router.js";

export type CaptureSessionState = "idle" | "initialized" | "running" | "stopped" | "error" | "disposed";
export type ConcurrentCallPolicy = "replace" | "reject";
export interface CaptureSessionOptions { router?: CaptureRouter; scenario?: ScenarioDefinition; concurrentCallPolicy?: ConcurrentCallPolicy }

export class CaptureSession {
  private state: CaptureSessionState = "idle";
  private readonly router: CaptureRouter;
  private readonly concurrentPolicy: ConcurrentCallPolicy;
  private activeController: AbortController | null = null;
  private ownership = 0;
  private source: FrameSourceType | null = null;
  constructor(options: CaptureSessionOptions = {}) {
    this.router = options.router ?? new CaptureRouter({ scenario: options.scenario });
    this.concurrentPolicy = options.concurrentCallPolicy ?? "replace";
  }
  getState(): CaptureSessionState { return this.state; }
  getSource(): FrameSourceType | null { return this.source; }
  initialize(): void {
    this.assertNotDisposed();
    if (this.state === "idle" || this.state === "stopped" || this.state === "error") this.state = "initialized";
  }
  start(source?: FrameSourceType): void {
    this.assertNotDisposed();
    if (this.state === "idle") this.initialize();
    this.source = source ?? this.source;
    this.state = "running";
  }
  stop(): void {
    if (this.state === "disposed") return;
    this.cancel();
    this.state = "stopped";
  }
  cancel(): void {
    this.ownership += 1;
    this.activeController?.abort();
    this.activeController = null;
  }
  updateConfiguration(scenario: ScenarioDefinition): void {
    this.assertNotDisposed();
    const validated = validateScenario(scenario);
    if (!validated.ok) throw new SdkException(sdkError("malformed_scenario", validated.message));
    this.cancel();
    this.router.updateScenario(validated.value);
  }
  switchSource(source: FrameSourceType): void {
    this.assertNotDisposed();
    this.cancel();
    this.source = source;
    if (this.state === "idle") this.state = "initialized";
  }
  async scan(frame: NormalizedFrame, options: { signal?: AbortSignal } = {}): Promise<ScanOutcome> {
    this.assertNotDisposed();
    if (this.state !== "running") return this.lifecycleFailure(frame.id, "session_not_running", "Capture session must be started before scan().");
    if (this.activeController && this.concurrentPolicy === "reject") return this.lifecycleFailure(frame.id, "concurrent_call_rejected", "This session allows only one active scan.");
    if (this.activeController) this.cancel();
    const owner = ++this.ownership;
    const controller = new AbortController();
    this.activeController = controller;
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const outcome = await this.router.scan(frame, { signal: controller.signal });
      if (owner !== this.ownership) return this.lifecycleFailure(frame.id, "cancelled", "Result belongs to a superseded session job.");
      return outcome;
    } catch (error) {
      this.state = "error";
      return this.lifecycleFailure(frame.id, "internal_invariant_failure", error instanceof Error ? error.message : String(error));
    } finally {
      options.signal?.removeEventListener("abort", onAbort);
      if (this.activeController === controller) this.activeController = null;
    }
  }
  dispose(): void {
    if (this.state === "disposed") return;
    this.cancel();
    this.source = null;
    this.state = "disposed";
  }
  private assertNotDisposed(): void {
    if (this.state === "disposed") throw new SdkException(sdkError("session_disposed", "Capture session has been disposed."));
  }
  private lifecycleFailure(frameId: string, code: "session_not_running" | "concurrent_call_rejected" | "cancelled" | "internal_invariant_failure", message: string): ScanFailure {
    return { ok: false, error: sdkError(code, message), frameId, scenarioId: this.router.getScenario().id, attemptCount: 0, timing: { totalMs: 0 } };
  }
}
