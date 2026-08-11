import type { BarcodeTrack, TrackROIFrame, TrackROIPlan, TrackROISetOptions } from "./types.js";
/**
 * Produces a bounded, renderer/decoder-neutral multi-target ROI plan. The plan
 * always schedules a periodic global scan so ROI optimization cannot hide a
 * newly entering barcode indefinitely.
 */
export declare class TrackROISet {
    private readonly options;
    private lastGlobalFrame;
    private lastSize;
    constructor(options?: TrackROISetOptions);
    plan(tracks: readonly BarcodeTrack[], frame: TrackROIFrame): TrackROIPlan;
    get size(): number;
    reset(): void;
    private roiFor;
}
//# sourceMappingURL=track-roi-set.d.ts.map