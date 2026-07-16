export interface MemoryLease {
    readonly bytes: number;
    readonly label: string;
    readonly kind: MemoryLeaseKind;
    readonly released: boolean;
    reclassify(kind: MemoryLeaseKind, label?: string): void;
    release(): void;
}
export type MemoryLeaseKind = "artifact" | "cache" | "scratch";
export interface MemoryObservation {
    currentControlledBytes: number;
    peakControlledBytes: number;
    retainedArtifactBytes: number;
    retainedCacheBytes: number;
    transientScratchBytes: number;
}
export declare class FrameMemoryBudget {
    readonly limitBytes: number;
    private bytes;
    private peakBytes;
    private readonly byKind;
    private leases;
    constructor(limitBytes: number);
    get retainedBytes(): number;
    get remainingBytes(): number;
    get observation(): MemoryObservation;
    reserve(bytes: number, label: string, kind?: MemoryLeaseKind): MemoryLease;
    reserveScratch(bytes: number, label: string): MemoryLease;
    resize(lease: MemoryLease, bytes: number): void;
    releaseAll(): void;
}
//# sourceMappingURL=memory-budget.d.ts.map