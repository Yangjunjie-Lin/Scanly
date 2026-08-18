import type { BarcodeObservation, BarcodeTrack, BarcodeTrackerOptions, BarcodeTrackerUpdate, TrackingFrame, TrackingStatistics } from "./types.js";
/** Deterministic, bounded multi-barcode physical-instance tracker. */
export declare class BarcodeTracker {
    private readonly options;
    private readonly tracks;
    private readonly associationLatencies;
    private sequence;
    private lastProcessedFrameId;
    private pendingObservationCount;
    private readonly statistics;
    constructor(options?: BarcodeTrackerOptions);
    update(observations: readonly BarcodeObservation[], frame: TrackingFrame): BarcodeTrackerUpdate;
    update(observations: readonly BarcodeObservation[], frameId: number, timestamp?: number): BarcodeTrackerUpdate;
    /** Alias that emphasizes the required one-complete-observation-set-per-frame contract. */
    observeFrame(observations: readonly BarcodeObservation[], frame: TrackingFrame): BarcodeTrackerUpdate;
    getTracks(): readonly BarcodeTrack[];
    getTrack(trackId: string): BarcodeTrack | undefined;
    get size(): number;
    get lostSize(): number;
    getStatistics(): TrackingStatistics;
    reset(): void;
    dispose(): void;
    private createTrack;
    private applyObservation;
    private validateFrame;
    private recordAssociationLatency;
}
//# sourceMappingURL=barcode-tracker.d.ts.map