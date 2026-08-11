import type { NormalizedFrame } from "@scanly/core";
import type { BarcodeObservationSet } from "../scanner/types.js";
import type { DecodeProfile, ScannerDecodeROIPhase, TemporalROIHint } from "../scanner/types.js";
import { BarcodeTracker } from "./barcode-tracker.js";
import { TrackROISet } from "./track-roi-set.js";
import type { BarcodeTrack, BarcodeTrackerOptions, TrackROIPlan, TrackROISetOptions, TrackingStatistics } from "./types.js";
export interface ScannerTrackingRuntimeOptions {
    tracker?: BarcodeTracker;
    trackerOptions?: BarcodeTrackerOptions;
    roiSet?: TrackROISet;
    roi?: TrackROISetOptions;
    /** Maximum observations retained from one bounded multi-code decode. */
    maxResults?: number;
    /** Optional profile pin; omitted to retain Beta 1 bounded escalation. */
    profile?: DecodeProfile;
    /** Non-global frames between one tracked-envelope request and an uncovered-cell request. */
    uncoveredRegionIntervalFrames?: number;
}
export interface ScannerTrackingDecodeSelection {
    phase: Exclude<ScannerDecodeROIPhase, "temporal">;
    roi?: TemporalROIHint;
    plan: TrackROIPlan;
}
/**
 * Small composition layer between ScannerSession and BarcodeTracker. It turns
 * a TrackROISet plan into one decode request per frame, keeping decode work
 * independent of the number of live tracks.
 */
export declare class ScannerTrackingRuntime {
    readonly maxResults: number;
    readonly profile?: DecodeProfile;
    private readonly tracker;
    private readonly roiSet;
    private readonly uncoveredRegionIntervalFrames;
    private nonGlobalFrameCount;
    private uncoveredCursor;
    constructor(options?: ScannerTrackingRuntimeOptions);
    selectDecode(frameId: number, frame: Pick<NormalizedFrame, "width" | "height">): ScannerTrackingDecodeSelection;
    observe(set: BarcodeObservationSet): void;
    getTracks(): readonly BarcodeTrack[];
    getStatistics(): TrackingStatistics;
    get controlledSize(): number;
    reset(): void;
}
//# sourceMappingURL=scanner-tracking-runtime.d.ts.map