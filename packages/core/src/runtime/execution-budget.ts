import type { FrameMemoryBudget } from "./memory-budget.js";

export function monotonicNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export interface ExecutionBudgetOptions {
  signal?: AbortSignal;
  deadlineMs: number;
  now?: () => number;
  remainingAttempts?: () => number;
  memory?: FrameMemoryBudget;
}

export class ExecutionBudget {
  readonly signal?: AbortSignal;
  readonly deadlineMs: number;
  readonly memory?: FrameMemoryBudget;
  private readonly clock: () => number;
  private readonly attempts: () => number;

  constructor(options: ExecutionBudgetOptions) {
    this.signal = options.signal;
    this.deadlineMs = options.deadlineMs;
    this.clock = options.now ?? monotonicNow;
    this.attempts = options.remainingAttempts ?? (() => Number.POSITIVE_INFINITY);
    this.memory = options.memory;
  }

  now(): number { return this.clock(); }
  remainingAttempts(): number { return Math.max(0, this.attempts()); }
  remainingIntermediateBytes(): number { return this.memory?.remainingBytes ?? Number.POSITIVE_INFINITY; }

  throwIfExceeded(stage: string): void {
    if (this.signal?.aborted) {
      throw Object.assign(new Error(`Execution cancelled during ${stage}.`), { name: "AbortError", code: "cancelled", stage });
    }
    if (this.clock() >= this.deadlineMs) {
      throw Object.assign(new Error(`Execution deadline exceeded during ${stage}.`), { name: "TimeoutError", code: "timeout", stage });
    }
  }
}
