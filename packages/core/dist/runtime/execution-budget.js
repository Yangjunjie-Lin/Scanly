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
    constructor(options) {
        this.signal = options.signal;
        this.deadlineMs = options.deadlineMs;
        this.clock = options.now ?? monotonicNow;
        this.attempts = options.remainingAttempts ?? (() => Number.POSITIVE_INFINITY);
        this.memory = options.memory;
    }
    now() { return this.clock(); }
    remainingAttempts() { return Math.max(0, this.attempts()); }
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