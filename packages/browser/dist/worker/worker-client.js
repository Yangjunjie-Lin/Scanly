import { sdkError } from "@scanly/core";
import { toTransferableFrame } from "./transferable-buffer.js";
import { isWorkerResponse } from "./worker-messages.js";
// Module loading and WASM initialization can exceed two seconds when multiple
// browsers contend for CPU in CI. Five seconds still leaves seven seconds of
// the balanced scenario for a bounded main-thread fallback.
const WORKER_STARTUP_WATCHDOG_MS = 5_000;
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
    return {
        ok: false,
        error: sdkError(code, `Image decoder Worker failed: ${message.slice(0, 2_048)}`),
        frameId: job.frameId,
        scenarioId: job.scenarioId,
        attemptCount: job.attemptCount ?? 0,
        timing: {
            totalMs: Date.now() - job.startedAt,
            ...(job.setupMs === undefined ? {} : { workerSetupMs: job.setupMs }),
            ...(job.transferMs === undefined ? {} : { workerTransferMs: job.transferMs }),
        },
    };
}
function cancelled(job) {
    return { ok: false, error: sdkError("cancelled", "Decode cancelled."), frameId: job.frameId, scenarioId: job.scenarioId, attemptCount: job.attemptCount ?? 0, timing: { totalMs: Date.now() - job.startedAt } };
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
        if (Date.now() >= job.deadlineAt) {
            this.failWatchdog(job, job.receivedMessage ? "engine_execution_failure" : "worker_initialization_failure");
            return;
        }
        if (!job.receivedMessage) {
            job.receivedMessage = true;
            if (job.watchdog !== undefined)
                clearTimeout(job.watchdog);
            job.watchdog = setTimeout(() => this.failWatchdog(job, "engine_execution_failure"), Math.max(1, job.deadlineAt - Date.now()));
        }
        if (job.transferMs === undefined)
            job.transferMs = Math.max(0, Date.now() - job.postedAt);
        if (message.type === "stage") {
            job.onStage?.(message.stage);
            return;
        }
        if (message.type === "progress") {
            job.attemptCount = Math.max(job.attemptCount, message.attemptCount);
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
            this.finish(this.pending, workerFailure(this.pending, message, this.pending.receivedMessage ? "engine_execution_failure" : "worker_initialization_failure"));
        this.restartWorker();
    }
    failWatchdog(job, code) {
        if (this.pending !== job)
            return;
        this.finish(job, workerFailure(job, `Worker did not complete before the ${job.deadlineAt - job.startedAt} ms deadline.`, code));
        this.restartWorker();
    }
    finish(job, outcome) {
        if (this.pending !== job)
            return;
        if (job.watchdog !== undefined)
            clearTimeout(job.watchdog);
        if (job.signal && job.onAbort)
            job.signal.removeEventListener("abort", job.onAbort);
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
            const postedAt = Date.now();
            const deadlineAt = postedAt + Math.max(1, scenario.budgets.maxExecutionMs);
            const job = {
                jobId, generation, ...identity, postedAt, setupMs, attemptCount: 0, receivedMessage: false, deadlineAt, resolve,
                signal: options.signal, onStage: options.onStage, onProgress: options.onProgress,
            };
            job.onAbort = () => { if (this.pending === job)
                this.cancel(); };
            job.watchdog = setTimeout(() => this.failWatchdog(job, "worker_initialization_failure"), Math.min(WORKER_STARTUP_WATCHDOG_MS, Math.max(1, deadlineAt - Date.now())));
            this.currentJobId = jobId;
            this.pending = job;
            options.signal?.addEventListener("abort", job.onAbort, { once: true });
            if (options.signal?.aborted) {
                this.cancel();
                return;
            }
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
        if (job.watchdog !== undefined)
            clearTimeout(job.watchdog);
        if (job.signal && job.onAbort)
            job.signal.removeEventListener("abort", job.onAbort);
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