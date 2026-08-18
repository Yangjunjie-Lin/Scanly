import type { DecodedBarcode } from "@scanly/core";
import type { BarcodeGeometry, ConfirmationMode, FrameQuality, TemporalCandidate } from "./types.js";
export interface TemporalCandidateStoreOptions {
    mode?: ConfirmationMode;
    windowMs?: number;
    lostAfterMs?: number;
    maximumCandidates?: number;
    immediateQualityThreshold?: number;
}
export interface CandidateObservation {
    candidate: TemporalCandidate;
    confirmed: boolean;
    newlyConfirmed: boolean;
}
export declare class TemporalCandidateStore {
    private readonly options;
    private readonly candidates;
    constructor(options?: TemporalCandidateStoreOptions);
    observe(barcode: DecodedBarcode, geometry: BarcodeGeometry | undefined, quality: FrameQuality, now?: number): CandidateObservation;
    lost(now?: number): Array<{
        candidate: TemporalCandidate;
        barcode: DecodedBarcode;
    }>;
    reset(): void;
    get size(): number;
    private prune;
    private requiredObservations;
    private geometryStable;
}
//# sourceMappingURL=temporal-confirmation.d.ts.map