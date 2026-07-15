import { toTransferable } from "./transferable-buffer.js";
import { isWorkerResponse } from "./worker-messages.js";
let singleton = null;
function debugState() {
    if (typeof window === "undefined" || !navigator.webdriver)
        return null;
    return (window.__SCANLY_WORKER_DEBUG__ ??= {
        created: 0,
        terminated: 0,
        decodePosted: 0,
        lastPath: null,
    });
}
export function markDecodePath(path) {
    const state = debugState();
    if (state)
        state.lastPath = path;
}
function defaultWorkerFactory() {
    const state = debugState();
    if (state)
        state.created += 1;
    return new Worker(new URL("./decode-worker.js", import.meta.url), {
        type: "module",
    });
}
function emptyPhaseTiming() {
    return {
        candidateGenerationMs: 0,
        jsqrMs: 0,
        zxingMs: 0,
        preprocessMs: 0,
        rotationMs: 0,
    };
}
function workerFailure(message, elapsedMs, timing, reason = "worker_error") {
    return {
        ok: false,
        reason,
        message: `Image decoder worker failed: ${message}`,
        attempts: [],
        attemptCount: 0,
        elapsedMs,
        cancelled: false,
        phaseTiming: timing,
    };
}
export function getDecodeWorkerClient() {
    if (!singleton)
        singleton = new DecodeWorkerClient();
    return singleton;
}
/** Test hook: reset singleton between tests. */
export function resetDecodeWorkerClientForTests() {
    singleton?.dispose();
    singleton = null;
}
export function disposeDecodeWorkerClient() {
    singleton?.dispose();
    singleton = null;
}
export class DecodeWorkerClient {
    workerFactory;
    worker = null;
    currentJobId = null;
    pending = null;
    seq = 0;
    constructor(workerFactory = defaultWorkerFactory) {
        this.workerFactory = workerFactory;
    }
    ensureWorker() {
        if (this.worker)
            return { worker: this.worker, setupMs: 0 };
        const started = Date.now();
        this.worker = this.workerFactory();
        this.worker.onmessage = (event) => {
            if (!isWorkerResponse(event.data)) {
                this.handleWorkerError("Worker returned a malformed message.");
                return;
            }
            this.handleMessage(event.data);
        };
        this.worker.onerror = (event) => this.handleWorkerError(event.message || "Unknown worker error");
        return { worker: this.worker, setupMs: Date.now() - started };
    }
    timingFor(job, cancellationLatencyMs) {
        return {
            ...emptyPhaseTiming(),
            workerSetupMs: job.setupMs,
            workerTransferMs: job.transferMs ?? Math.max(0, Date.now() - job.postedAt),
            ...(cancellationLatencyMs === undefined ? {} : { cancellationLatencyMs }),
        };
    }
    noteFirstMessage(job) {
        if (job.transferMs === undefined)
            job.transferMs = Math.max(0, Date.now() - job.postedAt);
    }
    handleMessage(msg) {
        const job = this.pending;
        if (!job || msg.jobId !== this.currentJobId || msg.jobId !== job.jobId)
            return;
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
            this.finish(job, workerFailure(msg.message, Date.now() - job.startedAt, this.timingFor(job)));
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
    handleWorkerError(message) {
        const job = this.pending;
        if (job) {
            this.finish(job, workerFailure(message, Date.now() - job.startedAt, this.timingFor(job)));
        }
        this.restartWorker();
    }
    finish(job, outcome) {
        if (this.pending !== job)
            return;
        this.pending = null;
        this.currentJobId = null;
        job.resolve(outcome);
    }
    restartWorker() {
        const hadWorker = Boolean(this.worker);
        try {
            this.worker?.terminate();
        }
        catch {
            // A crashed worker may already be terminated.
        }
        if (hadWorker) {
            const state = debugState();
            if (state)
                state.terminated += 1;
        }
        this.worker = null;
    }
    async decode(buffer, options = {}) {
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
        let worker;
        let setupMs;
        try {
            ({ worker, setupMs } = this.ensureWorker());
        }
        catch (error) {
            return workerFailure(error instanceof Error ? error.message : String(error), Date.now() - startedAt, emptyPhaseTiming(), "worker_initialization_failure");
        }
        const { serialized, transfer } = toTransferable(buffer);
        return new Promise((resolve) => {
            const job = {
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
                const state = debugState();
                if (state)
                    state.decodePosted += 1;
                worker.postMessage({ type: "decode", jobId, pixels: serialized, config: options.config }, transfer);
            }
            catch (error) {
                this.finish(job, workerFailure(error instanceof Error ? error.message : String(error), Date.now() - startedAt, this.timingFor(job)));
                this.restartWorker();
            }
        });
    }
    /** Cancel the active job, settle its promise, and recreate the worker lazily. */
    cancel() {
        const jobId = this.currentJobId;
        const job = this.pending;
        if (!jobId || !job)
            return;
        const cancelStarted = Date.now();
        this.currentJobId = null;
        this.pending = null;
        try {
            this.worker?.postMessage({ type: "cancel", jobId });
        }
        catch {
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
    dispose() {
        this.cancel();
        this.restartWorker();
    }
}
//# sourceMappingURL=worker-client.js.map