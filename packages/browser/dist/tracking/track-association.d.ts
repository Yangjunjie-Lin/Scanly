import type { BarcodeTrack, BarcodeObservation, TrackAssociationResult, TrackAssociationWeights } from "./types.js";
export declare const DEFAULT_ASSOCIATION_THRESHOLD = 2.5;
export declare const DEFAULT_ASSOCIATION_WEIGHTS: Readonly<TrackAssociationWeights>;
export interface TrackAssociationOptions {
    threshold?: number;
    weights?: Partial<TrackAssociationWeights>;
    /** Current frame time, used to age associations after irregular capture. */
    timestamp?: number;
    /** Converts elapsed milliseconds to a comparable number of frame periods. */
    nominalFrameDurationMs?: number;
}
export declare function calculateAssociationCost(track: BarcodeTrack, observation: BarcodeObservation, frameId: number, options?: TrackAssociationOptions): number;
/**
 * Globally minimizes the bounded track/observation cost matrix. Dummy columns
 * model an unmatched track, so an over-threshold pair can never steal a valid
 * observation from another track.
 */
export declare function associateTracks(tracks: readonly BarcodeTrack[], observations: readonly BarcodeObservation[], frameId: number, options?: TrackAssociationOptions): TrackAssociationResult;
//# sourceMappingURL=track-association.d.ts.map