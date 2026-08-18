import type { ScanOutcome } from "../contracts/result.js";
export interface DuplicateIdentityOptions {
    includeFormat?: boolean;
    includeSpatialTrack?: boolean;
    maxEntries?: number;
}
/** Session-scoped, bounded duplicate suppression for continuous sources. */
export declare class DuplicateSuppressionPolicy {
    private windowMs;
    private readonly identity;
    private readonly seen;
    private readonly maxEntries;
    constructor(windowMs: number, identity?: DuplicateIdentityOptions);
    updateWindow(windowMs: number): void;
    filter(outcome: ScanOutcome, nowMs?: number): ScanOutcome;
    clear(): void;
    get size(): number;
    private key;
    private prune;
}
//# sourceMappingURL=result-policies.d.ts.map