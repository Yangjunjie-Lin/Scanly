export function monotonicNow() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
}
export class ExecutionBudget {
    signal;
    deadlineMs;
    memory;
    clock;
    attempts;
    remaining;
    constructor(options) {
        this.signal = options.signal;
        this.deadlineMs = options.deadlineMs;
        this.clock = options.now ?? monotonicNow;
        this.attempts = options.remainingAttempts ?? (() => Number.POSITIVE_INFINITY);
        this.remaining = options.totalAttempts === undefined ? null : Math.max(0, Math.floor(options.totalAttempts));
        this.memory = options.memory;
    }
    now() { return this.clock(); }
    remainingAttempts() { return this.remaining ?? Math.max(0, this.attempts()); }
    tryConsumeAttempt() {
        if (this.remaining === null)
            return this.attempts() > 0;
        if (this.remaining <= 0)
            return false;
        this.remaining -= 1;
        return true;
    }
    remainingIntermediateBytes() { return this.memory?.remainingBytes ?? Number.POSITIVE_INFINITY; }
    throwIfExceeded(stage) {
        if (this.signal?.aborted) {
            throw Object.assign(new Error(`Execution cancelled during ${stage}.`), { name: "AbortError", code: "cancelled", stage });
        }
        if (this.clock() >= this.deadlineMs) {
            throw Object.assign(new Error(`Execution deadline exceeded during ${stage}.`), { name: "TimeoutError", code: "timeout", stage });
        }
    }
}
//# sourceMappingURL=execution-budget.js.map