import { sdkError } from "@scanly/core";
import { toTransferableFrame } from "./transferable-buffer.js";
import { isWorkerResponse } from "./worker-messages.js";
let singleton = null;
function debugState() {
    if (typeof window === "undefined" || !navigator.webdriver)
        return null;
    return (window.__SCANLY_WORKER_DEBUG__ ??= { created: 0, terminated: 0, decodePosted: 0, workerDecodeCount: 0, mainThreadDecodeCount: 0, workerDegraded: false, workerRestartCount: 0, lastPath: null });
}
export function markDecodePath(path) { const state = debugState(); if (state) {
    state.lastPath = path;
    if (path === "worker")
        state.workerDecodeCount += 1;
    if (path === "main-thread")
        state.mainThreadDecodeCount += 1;
} }
export function markWorkerRecovery(degraded, restarts) { const state = debugState(); if (state) {
    state.workerDegraded = degraded;
    state.workerRestartCount = restarts;
} }
function defaultWorkerFactory() {
    const state = debugState();
    if (state)
        state.created += 1;
    return new Worker(new URL("./decode-worker.js", import.meta.url), { type: "module" });
}
function workerFailure(job, message, code = "engine_execution_failure") {
    return { ok: false, error: sdkError(code, `Image decoder Worker failed: ${message.slice(0, 2_048)}`), frameId: job.frameId, scenarioId: job.scenarioId, attemptCount: 0, timing: { totalMs: Date.now() - job.startedAt } };
}
function cancelled(job) {
    return { ok: false, error: sdkError("cancelled", "Decode cancelled."), frameId: job.frameId, scenarioId: job.scenarioId, attemptCount: 0, timing: { totalMs: Date.now() - job.startedAt } };
}
export function getDecodeWorkerClient() { return (singleton ??= new DecodeWorkerClient()); }
export function resetDecodeWorkerClientForTests() { singleton?.dispose(); singleton = null; }
export function disposeDecodeWorkerClient() { singleton?.dispose(); singleton = null; }
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
        this.worker.onmessage = (event) => isWorkerResponse(event.data) ? this.handleMessage(event.data) : this.handleWorkerError("Worker returned a malformed message.");
        this.worker.onerror = (event) => this.handleWorkerError(event.message || "Unknown Worker error");
        return { worker: this.worker, setupMs: Date.now() - started };
    }
    handleMessage(message) {
        const job = this.pending;
        if (!job || message.jobId !== job.jobId || message.jobId !== this.currentJobId || message.generation !== job.generation)
            return;
        if (job.transferMs === undefined)
            job.transferMs = Math.max(0, Date.now() - job.postedAt);
        if (message.type === "stage") {
            job.onStage?.(message.stage);
            return;
        }
        if (message.type === "progress") {
            job.onProgress?.({ attemptCount: message.attemptCount });
            return;
        }
        if (message.type === "cancelled") {
            this.finish(job, cancelled(job));
            return;
        }
        if (message.type === "error") {
            this.finish(job, workerFailure(job, message.message));
            this.restartWorker();
            return;
        }
        this.finish(job, { ...message.outcome, timing: { ...message.outcome.timing, workerSetupMs: job.setupMs, workerTransferMs: job.transferMs ?? 0 } });
    }
    handleWorkerError(message) {
        if (this.pending)
            this.finish(this.pending, workerFailure(this.pending, message, "worker_initialization_failure"));
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
        catch { /* crashed Worker */ }
        if (hadWorker) {
            const state = debugState();
            if (state)
                state.terminated += 1;
        }
        this.worker = null;
    }
    async scan(frame, scenario, options = {}) {
        const startedAt = Date.now();
        const identity = { frameId: frame.id, scenarioId: scenario.id, startedAt };
        if (options.signal?.aborted)
            return cancelled(identity);
        this.cancel();
        const jobId = `job-${++this.seq}-${startedAt}`;
        const generation = options.generation ?? 0;
        let worker;
        let setupMs;
        try {
            ({ worker, setupMs } = this.ensureWorker());
        }
        catch (error) {
            return workerFailure(identity, error instanceof Error ? error.message : String(error), "worker_initialization_failure");
        }
        const { serialized, transfer } = toTransferableFrame(frame, options.preserveSourceForFallback);
        return new Promise((resolve) => {
            const job = { jobId, generation, ...identity, postedAt: Date.now(), setupMs, resolve, onStage: options.onStage, onProgress: options.onProgress };
            this.currentJobId = jobId;
            this.pending = job;
            try {
                const state = debugState();
                if (state)
                    state.decodePosted += 1;
                worker.postMessage({ type: "scan", jobId, generation, frame: serialized, scenario, progress: Boolean(options.onProgress) }, transfer);
            }
            catch (error) {
                this.finish(job, workerFailure(job, error instanceof Error ? error.message : String(error)));
                this.restartWorker();
            }
        });
    }
    cancel() {
        const job = this.pending;
        if (!job || !this.currentJobId)
            return;
        const jobId = this.currentJobId;
        this.pending = null;
        this.currentJobId = null;
        try {
            this.worker?.postMessage({ type: "cancel", jobId, generation: job.generation });
        }
        catch { /* termination is authoritative */ }
        this.restartWorker();
        job.resolve(cancelled(job));
    }
    dispose() { this.cancel(); this.restartWorker(); }
}
//# sourceMappingURL=worker-client.js.map