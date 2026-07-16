import type { FrameMemoryBudget } from "./memory-budget.js";
export declare function monotonicNow(): number;
export interface ExecutionBudgetOptions {
    signal?: AbortSignal;
    deadlineMs: number;
    now?: () => number;
    remainingAttempts?: () => number;
    memory?: FrameMemoryBudget;
}
export declare class ExecutionBudget {
    readonly signal?: AbortSignal;
    readonly deadlineMs: number;
    readonly memory?: FrameMemoryBudget;
    private readonly clock;
    private readonly attempts;
    constructor(options: ExecutionBudgetOptions);
    now(): number;
    remainingAttempts(): number;
    remainingIntermediateBytes(): number;
    throwIfExceeded(stage: string): void;
}
//# sourceMappingURL=execution-budget.d.ts.map