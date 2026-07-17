import { sdkError, type NormalizedFrame, type ScanFailure, type ScanOutcome } from "@scanly/core";
import type { ScenarioDefinition } from "@scanly/scenario-schema";
import { toTransferableFrame } from "./transferable-buffer.js";
import { isWorkerResponse, type WorkerRequest, type WorkerResponse } from "./worker-messages.js";

export interface DecodeWorkerLike {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
}
export type DecodeWorkerFactory = () => DecodeWorkerLike;
export interface WorkerScanOptions { signal?: AbortSignal; generation?: number; preserveSourceForFallback?: boolean; onStage?: (stage: string) => void; onProgress?: (progress: { attemptCount: number }) => void }

type PendingJob = {
  jobId: string;
  frameId: string;
  scenarioId: string;
  startedAt: number;
  postedAt: number;
  setupMs: number;
  generation: number;
  transferMs?: number;
  resolve: (outcome: ScanOutcome) => void;
  onStage?: WorkerScanOptions["onStage"];
  onProgress?: WorkerScanOptions["onProgress"];
};

let singleton: DecodeWorkerClient | null = null;
type WorkerDebugState = { created: number; terminated: number; decodePosted: number; workerDecodeCount: number; mainThreadDecodeCount: number; workerDegraded: boolean; workerRestartCount: number; lastPath: "worker" | "main-thread" | null };
declare global { interface Window { __SCANLY_WORKER_DEBUG__?: WorkerDebugState } }

function debugState(): WorkerDebugState | null {
  if (typeof window === "undefined" || !navigator.webdriver) return null;
  return (window.__SCANLY_WORKER_DEBUG__ ??= { created: 0, terminated: 0, decodePosted: 0, workerDecodeCount: 0, mainThreadDecodeCount: 0, workerDegraded: false, workerRestartCount: 0, lastPath: null });
}
export function markDecodePath(path: WorkerDebugState["lastPath"]): void { const state = debugState(); if (state) { state.lastPath = path; if (path === "worker") state.workerDecodeCount += 1; if (path === "main-thread") state.mainThreadDecodeCount += 1; } }
export function markWorkerRecovery(degraded: boolean, restarts: number): void { const state = debugState(); if (state) { state.workerDegraded = degraded; state.workerRestartCount = restarts; } }

function defaultWorkerFactory(): DecodeWorkerLike {
  const state = debugState();
  if (state) state.created += 1;
  return new Worker(new URL("./decode-worker.js", import.meta.url), { type: "module" }) as DecodeWorkerLike;
}

function workerFailure(job: Pick<PendingJob, "frameId" | "scenarioId" | "startedAt">, message: string, code: "worker_initialization_failure" | "engine_execution_failure" = "engine_execution_failure"): ScanFailure {
  return { ok: false, error: sdkError(code, `Image decoder Worker failed: ${message.slice(0, 2_048)}`), frameId: job.frameId, scenarioId: job.scenarioId, attemptCount: 0, timing: { totalMs: Date.now() - job.startedAt } };
}

function cancelled(job: Pick<PendingJob, "frameId" | "scenarioId" | "startedAt">): ScanFailure {
  return { ok: false, error: sdkError("cancelled", "Decode cancelled."), frameId: job.frameId, scenarioId: job.scenarioId, attemptCount: 0, timing: { totalMs: Date.now() - job.startedAt } };
}

export function getDecodeWorkerClient(): DecodeWorkerClient { return (singleton ??= new DecodeWorkerClient()); }
export function resetDecodeWorkerClientForTests(): void { singleton?.dispose(); singleton = null; }
export function disposeDecodeWorkerClient(): void { singleton?.dispose(); singleton = null; }

export class DecodeWorkerClient {
  private worker: DecodeWorkerLike | null = null;
  private currentJobId: string | null = null;
  private pending: PendingJob | null = null;
  private seq = 0;
  constructor(private readonly workerFactory: DecodeWorkerFactory = defaultWorkerFactory) {}

  private ensureWorker(): { worker: DecodeWorkerLike; setupMs: number } {
    if (this.worker) return { worker: this.worker, setupMs: 0 };
    const started = Date.now();
    this.worker = this.workerFactory();
    this.worker.onmessage = (event) => isWorkerResponse(event.data) ? this.handleMessage(event.data) : this.handleWorkerError("Worker returned a malformed message.");
    this.worker.onerror = (event) => this.handleWorkerError(event.message || "Unknown Worker error");
    return { worker: this.worker, setupMs: Date.now() - started };
  }

  private handleMessage(message: WorkerResponse): void {
    const job = this.pending;
    if (!job || message.jobId !== job.jobId || message.jobId !== this.currentJobId || message.generation !== job.generation) return;
    if (job.transferMs === undefined) job.transferMs = Math.max(0, Date.now() - job.postedAt);
    if (message.type === "stage") { job.onStage?.(message.stage); return; }
    if (message.type === "progress") { job.onProgress?.({ attemptCount: message.attemptCount }); return; }
    if (message.type === "cancelled") { this.finish(job, cancelled(job)); return; }
    if (message.type === "error") { this.finish(job, workerFailure(job, message.message)); this.restartWorker(); return; }
    this.finish(job, { ...message.outcome, timing: { ...message.outcome.timing, workerSetupMs: job.setupMs, workerTransferMs: job.transferMs ?? 0 } });
  }

  private handleWorkerError(message: string): void {
    if (this.pending) this.finish(this.pending, workerFailure(this.pending, message, "worker_initialization_failure"));
    this.restartWorker();
  }

  private finish(job: PendingJob, outcome: ScanOutcome): void {
    if (this.pending !== job) return;
    this.pending = null;
    this.currentJobId = null;
    job.resolve(outcome);
  }

  private restartWorker(): void {
    const hadWorker = Boolean(this.worker);
    try { this.worker?.terminate(); } catch { /* crashed Worker */ }
    if (hadWorker) { const state = debugState(); if (state) state.terminated += 1; }
    this.worker = null;
  }

  async scan(frame: NormalizedFrame, scenario: ScenarioDefinition, options: WorkerScanOptions = {}): Promise<ScanOutcome> {
    const startedAt = Date.now();
    const identity = { frameId: frame.id, scenarioId: scenario.id, startedAt };
    if (options.signal?.aborted) return cancelled(identity);
    this.cancel();
    const jobId = `job-${++this.seq}-${startedAt}`;
    const generation = options.generation ?? 0;
    let worker: DecodeWorkerLike;
    let setupMs: number;
    try { ({ worker, setupMs } = this.ensureWorker()); }
    catch (error) { return workerFailure(identity, error instanceof Error ? error.message : String(error), "worker_initialization_failure"); }
    const { serialized, transfer } = toTransferableFrame(frame, options.preserveSourceForFallback);
    return new Promise<ScanOutcome>((resolve) => {
      const job: PendingJob = { jobId, generation, ...identity, postedAt: Date.now(), setupMs, resolve, onStage: options.onStage, onProgress: options.onProgress };
      this.currentJobId = jobId;
      this.pending = job;
      try {
        const state = debugState(); if (state) state.decodePosted += 1;
        worker.postMessage({ type: "scan", jobId, generation, frame: serialized, scenario, progress: Boolean(options.onProgress) }, transfer);
      } catch (error) {
        this.finish(job, workerFailure(job, error instanceof Error ? error.message : String(error)));
        this.restartWorker();
      }
    });
  }

  cancel(): void {
    const job = this.pending;
    if (!job || !this.currentJobId) return;
    const jobId = this.currentJobId;
    this.pending = null;
    this.currentJobId = null;
    try { this.worker?.postMessage({ type: "cancel", jobId, generation: job.generation }); } catch { /* termination is authoritative */ }
    this.restartWorker();
    job.resolve(cancelled(job));
  }

  dispose(): void { this.cancel(); this.restartWorker(); }
}
