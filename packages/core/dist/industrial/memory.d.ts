export type RecoveryBufferKind = "candidate" | "normalized" | "rectified" | "warp" | "grayscale" | "binary";
export interface RecoveryMemoryObservation {
    currentBytes: number;
    peakBytes: number;
    activeBuffers: number;
    peakBuffers: number;
    byKind: Readonly<Record<RecoveryBufferKind, number>>;
}
export interface RecoveryMemoryLease {
    readonly bytes: number;
    readonly kind: RecoveryBufferKind;
    readonly released: boolean;
    release(): void;
}
export declare class RecoveryMemoryAccountant {
    readonly maximumBytes: number;
    private currentBytes;
    private peakBytes;
    private peakBuffers;
    private readonly leases;
    private readonly byKind;
    constructor(maximumBytes: number);
    reserve(bytes: number, kind: RecoveryBufferKind): RecoveryMemoryLease;
    releaseAll(): void;
    get activeBufferCount(): number;
    get observation(): RecoveryMemoryObservation;
}
//# sourceMappingURL=memory.d.ts.map