export interface MemoryLease {
    readonly bytes: number;
    readonly label: string;
    readonly released: boolean;
    release(): void;
}
export declare class FrameMemoryBudget {
    readonly limitBytes: number;
    private bytes;
    private leases;
    constructor(limitBytes: number);
    get retainedBytes(): number;
    get remainingBytes(): number;
    reserve(bytes: number, label: string): MemoryLease;
    releaseAll(): void;
}
//# sourceMappingURL=memory-budget.d.ts.map