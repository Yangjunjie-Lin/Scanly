import { validateScenario, type ScenarioDefinition } from "@scanly/scenario-schema";
import { SdkException, sdkError } from "../contracts/errors.js";
import type { FrameSourceType, NormalizedFrame } from "../contracts/frame.js";
import type { ScanFailure, ScanOutcome } from "../contracts/result.js";
import { DuplicateSuppressionPolicy } from "./result-policies.js";
import { CaptureRouter } from "./router.js";

export type CaptureSessionState = "idle" | "initialized" | "running" | "stopped" | "error" | "disposed";
export type ConcurrentCallPolicy = "replace" | "reject";
export interface CaptureSessionOptions { router?: CaptureRouter; scenario?: ScenarioDefinition; concurrentCallPolicy?: ConcurrentCallPolicy; disposeRouter?: boolean; applyDuplicateSuppression?: boolean }

export class CaptureSession {
  private state: CaptureSessionState = "idle";
  private readonly router: CaptureRouter;
  private readonly concurrentPolicy: ConcurrentCallPolicy;
  private activeController: AbortController | null = null;
  private ownership = 0;
  private source: FrameSourceType | null = null;
  private readonly ownsRouter: boolean;
  private duplicatePolicy: DuplicateSuppressionPolicy;
  private readonly applyDuplicateSuppression: boolean;
  constructor(options: CaptureSessionOptions = {}) {
    this.router = options.router ?? new CaptureRouter({ scenario: options.scenario });
    this.ownsRouter = options.disposeRouter ?? !options.router;
    this.concurrentPolicy = options.concurrentCallPolicy ?? "replace";
    this.applyDuplicateSuppression = options.applyDuplicateSuppression ?? true;
    const scenario = options.scenario ?? this.router.getScenario();
    this.duplicatePolicy = new DuplicateSuppressionPolicy(scenario.duplicateSuppression.enabled ? scenario.duplicateSuppression.windowMs : 0);
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
    this.duplicatePolicy.clear();
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
    this.duplicatePolicy = new DuplicateSuppressionPolicy(validated.value.duplicateSuppression.enabled ? validated.value.duplicateSuppression.windowMs : 0);
  }
  switchSource(source: FrameSourceType): void {
    this.assertNotDisposed();
    this.cancel();
    this.source = source;
    this.duplicatePolicy.clear();
    if (this.state === "idle") this.state = "initialized";
  }
  async scan(frame: NormalizedFrame, options: { signal?: AbortSignal } = {}): Promise<ScanOutcome> {
    if (this.state === "disposed") return this.lifecycleFailure(frame, "session_disposed", "Capture session has been disposed.", true);
    if (this.state !== "running") return this.lifecycleFailure(frame, "session_not_running", "Capture session must be started before scan().", true);
    if (this.activeController && this.concurrentPolicy === "reject") return this.lifecycleFailure(frame, "concurrent_call_rejected", "This session allows only one active scan.", true);
    if (this.activeController) this.cancel();
    const owner = ++this.ownership;
    const controller = new AbortController();
    this.activeController = controller;
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const outcome = await this.router.scan(frame, { signal: controller.signal });
      if (owner !== this.ownership) return this.lifecycleFailure(frame, "cancelled", "Result belongs to a superseded session job.");
      const continuous = this.source === "camera" || this.source === "video-frame" || this.source === "hardware-scanner";
      return continuous && this.applyDuplicateSuppression ? this.duplicatePolicy.filter(outcome) : outcome;
    } catch (error) {
      this.state = "error";
      return this.lifecycleFailure(frame, "internal_invariant_failure", error instanceof Error ? error.message : String(error));
    } finally {
      options.signal?.removeEventListener("abort", onAbort);
      if (this.activeController === controller) this.activeController = null;
    }
  }
  async dispose(): Promise<void> {
    if (this.state === "disposed") return;
    this.cancel();
    this.duplicatePolicy.clear();
    this.source = null;
    this.state = "disposed";
    if (this.ownsRouter) await this.router.dispose();
  }
  private assertNotDisposed(): void {
    if (this.state === "disposed") throw new SdkException(sdkError("session_disposed", "Capture session has been disposed."));
  }
  private lifecycleFailure(frame: NormalizedFrame, code: "session_not_running" | "session_disposed" | "concurrent_call_rejected" | "cancelled" | "internal_invariant_failure", message: string, release = false): ScanFailure {
    if (release && frame.ownership !== "borrowed") frame.dispose?.();
    return { ok: false, error: sdkError(code, message), frameId: frame.id, scenarioId: this.router.getScenario().id, attemptCount: 0, timing: { totalMs: 0 } };
  }
}
