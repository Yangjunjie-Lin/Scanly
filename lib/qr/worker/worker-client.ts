import type {
  DecodeFailure,
  DecodeOutcome,
  DecodePipelineOptions,
  PhaseTiming,
  PixelBuffer,
} from "../types";
import { toTransferable } from "./transferable-buffer";
import type { WorkerRequest, WorkerResponse } from "./worker-messages";

export interface DecodeWorkerLike {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
}

export type DecodeWorkerFactory = () => DecodeWorkerLike;

type PendingJob = {
  jobId: string;
  startedAt: number;
  postedAt: number;
  setupMs: number;
  transferMs?: number;
  resolve: (outcome: DecodeOutcome) => void;
  onStage?: DecodePipelineOptions["onStage"];
  onProgress?: DecodePipelineOptions["onProgress"];
};

let singleton: DecodeWorkerClient | null = null;

function defaultWorkerFactory(): DecodeWorkerLike {
  return new Worker(new URL("./decode-worker.ts", import.meta.url), {
    type: "module",
  }) as DecodeWorkerLike;
}

function emptyPhaseTiming(): PhaseTiming {
  return {
    candidateGenerationMs: 0,
    jsqrMs: 0,
    zxingMs: 0,
    preprocessMs: 0,
    rotationMs: 0,
  };
}

function workerFailure(message: string, elapsedMs: number, timing: PhaseTiming): DecodeFailure {
  return {
    ok: false,
    reason: "worker_error",
    message: `Image decoder worker failed: ${message}`,
    attempts: [],
    attemptCount: 0,
    elapsedMs,
    cancelled: false,
    phaseTiming: timing,
  };
}

export function getDecodeWorkerClient(): DecodeWorkerClient {
  if (!singleton) singleton = new DecodeWorkerClient();
  return singleton;
}

/** Test hook: reset singleton between tests. */
export function resetDecodeWorkerClientForTests(): void {
  singleton?.dispose();
  singleton = null;
}

export function disposeDecodeWorkerClient(): void {
  singleton?.dispose();
  singleton = null;
}

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
    this.worker.onmessage = (event) => this.handleMessage(event.data);
    this.worker.onerror = (event) => this.handleWorkerError(event.message || "Unknown worker error");
    return { worker: this.worker, setupMs: Date.now() - started };
  }

  private timingFor(job: PendingJob, cancellationLatencyMs?: number): PhaseTiming {
    return {
      ...emptyPhaseTiming(),
      workerSetupMs: job.setupMs,
      workerTransferMs: job.transferMs ?? Math.max(0, Date.now() - job.postedAt),
      ...(cancellationLatencyMs === undefined ? {} : { cancellationLatencyMs }),
    };
  }

  private noteFirstMessage(job: PendingJob): void {
    if (job.transferMs === undefined) job.transferMs = Math.max(0, Date.now() - job.postedAt);
  }

  private handleMessage(msg: WorkerResponse): void {
    const job = this.pending;
    if (!job || msg.jobId !== this.currentJobId || msg.jobId !== job.jobId) return;
    this.noteFirstMessage(job);

    if (msg.type === "stage") {
      job.onStage?.(msg.stage);
      return;
    }
    if (msg.type === "progress") {
      job.onProgress?.({ attemptCount: msg.attemptCount });
      return;
    }
    if (msg.type === "cancelled") {
      this.finish(job, {
        ok: false,
        reason: "cancelled",
        message: "Decode cancelled.",
        attempts: [],
        attemptCount: 0,
        elapsedMs: msg.elapsedMs,
        cancelled: true,
        phaseTiming: this.timingFor(job, 0),
      });
      return;
    }
    if (msg.type === "error") {
      this.finish(
        job,
        workerFailure(msg.message, Date.now() - job.startedAt, this.timingFor(job))
      );
      this.restartWorker();
      return;
    }

    const timing = {
      ...(msg.outcome.phaseTiming ?? emptyPhaseTiming()),
      workerSetupMs: job.setupMs,
      workerTransferMs: job.transferMs ?? 0,
    };
    this.finish(job, { ...msg.outcome, phaseTiming: timing });
  }

  private handleWorkerError(message: string): void {
    const job = this.pending;
    if (job) {
      this.finish(
        job,
        workerFailure(message, Date.now() - job.startedAt, this.timingFor(job))
      );
    }
    this.restartWorker();
  }

  private finish(job: PendingJob, outcome: DecodeOutcome): void {
    if (this.pending !== job) return;
    this.pending = null;
    this.currentJobId = null;
    job.resolve(outcome);
  }

  private restartWorker(): void {
    try {
      this.worker?.terminate();
    } catch {
      // A crashed worker may already be terminated.
    }
    this.worker = null;
  }

  async decode(buffer: PixelBuffer, options: DecodePipelineOptions = {}): Promise<DecodeOutcome> {
    const startedAt = Date.now();
    if (options.signal?.aborted) {
      return {
        ok: false,
        reason: "cancelled",
        message: "Decode cancelled.",
        attempts: [],
        attemptCount: 0,
        elapsedMs: 0,
        cancelled: true,
        phaseTiming: { ...emptyPhaseTiming(), cancellationLatencyMs: 0 },
      };
    }
    // Only a live incoming owner may replace the active job. A stale upload can
    // finish image loading after its successor has already started.
    this.cancel();

    const jobId = `job-${++this.seq}-${startedAt}`;
    const { worker, setupMs } = this.ensureWorker();
    const { serialized, transfer } = toTransferable(buffer);

    return new Promise<DecodeOutcome>((resolve) => {
      const job: PendingJob = {
        jobId,
        startedAt,
        postedAt: Date.now(),
        setupMs,
        resolve,
        onStage: options.onStage,
        onProgress: options.onProgress,
      };
      this.currentJobId = jobId;
      this.pending = job;

      try {
        worker.postMessage(
          { type: "decode", jobId, pixels: serialized, config: options.config },
          transfer
        );
      } catch (error) {
        this.finish(
          job,
          workerFailure(
            error instanceof Error ? error.message : String(error),
            Date.now() - startedAt,
            this.timingFor(job)
          )
        );
        this.restartWorker();
      }
    });
  }

  /** Cancel the active job, settle its promise, and recreate the worker lazily. */
  cancel(): void {
    const jobId = this.currentJobId;
    const job = this.pending;
    if (!jobId || !job) return;

    const cancelStarted = Date.now();
    this.currentJobId = null;
    this.pending = null;
    try {
      this.worker?.postMessage({ type: "cancel", jobId });
    } catch {
      // Immediate termination below is the cancellation fallback.
    }
    this.restartWorker();

    const cancellationLatencyMs = Date.now() - cancelStarted;
    job.resolve({
      ok: false,
      reason: "cancelled",
      message: "Decode cancelled.",
      attempts: [],
      attemptCount: 0,
      elapsedMs: Date.now() - job.startedAt,
      cancelled: true,
      phaseTiming: this.timingFor(job, cancellationLatencyMs),
    });
  }

  dispose(): void {
    this.cancel();
    this.restartWorker();
  }
}
