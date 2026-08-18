import type { DecodeProfile, FrameQuality } from "./types.js";
export interface BoundedDecodeEscalationOptions {
    balancedEveryMisses?: number;
    robustAfterMisses?: number;
    robustCooldownFrames?: number;
}
/** Deterministic Fast-first escalation; Robust is always separated by a cooldown. */
export declare class BoundedDecodeEscalation {
    private readonly options;
    private misses;
    private frame;
    private lastRobustFrame;
    private lastSuccessAt;
    constructor(options?: BoundedDecodeEscalationOptions);
    select(quality: FrameQuality, hasStableRoi: boolean, now?: number): DecodeProfile;
    observe(success: boolean, now?: number): void;
    reset(): void;
    get consecutiveMisses(): number;
}
//# sourceMappingURL=decode-escalation.d.ts.map