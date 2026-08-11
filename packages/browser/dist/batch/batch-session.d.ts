import type { ScannerSession } from "../scanner/scanner-session.js";
import { BarcodeTracker } from "../tracking/barcode-tracker.js";
import type { BarcodeObservation, BarcodeTrack, BarcodeTrackerOptions, BarcodeTrackerUpdate, TrackingFrame } from "../tracking/types.js";
import { type BatchControllerOptions } from "./batch-controller.js";
import type { BatchEventListener, BatchState, BatchStatistics, BatchUnsubscribe, TrackListener } from "./types.js";
export interface BatchScanSessionOptions extends BatchControllerOptions {
    /** Existing camera runtime; BatchScanSession never creates a second one. */
    scanner: ScannerSession;
    tracker?: BarcodeTracker;
    trackerOptions?: BarcodeTrackerOptions;
    /** Defaults to true because BatchScanSession owns the delegated lifecycle. */
    disposeScanner?: boolean;
    /** Defaults to true for both injected and internally-created trackers. */
    disposeTracker?: boolean;
}
/**
 * ScannerSession + BarcodeTracker + BatchController composition. React and
 * other UI layers only subscribe to the resulting SDK state.
 */
export declare class BatchScanSession {
    private readonly scanner;
    private readonly tracker;
    private readonly controller;
    private readonly disposeScanner;
    private readonly disposeTracker;
    private readonly subscriptions;
    private readonly pendingScannerFrames;
    private generation;
    private stopRequested;
    private disposed;
    constructor(options: BatchScanSessionOptions);
    start(): Promise<void>;
    pause(): void;
    resume(): void;
    stop(): Promise<void>;
    dispose(): Promise<void>;
    getTracks(): readonly BarcodeTrack[];
    getBatchState(): BatchState;
    getStatistics(): BatchStatistics;
    onTrack(listener: TrackListener): BatchUnsubscribe;
    onBatchEvent(listener: BatchEventListener): BatchUnsubscribe;
    /** Explicit frame API used by deterministic runtimes and custom capture adapters. */
    processFrame(observations: readonly BarcodeObservation[], frame: TrackingFrame): BarcodeTrackerUpdate;
    /** Accept an update from an externally-driven instance of the same tracker. */
    applyTrackerUpdate(update: BarcodeTrackerUpdate): void;
    private observeScannerDiagnostic;
    private observeScannerObservationSet;
    private flushScannerFrame;
    private observeScannerState;
    private invalidatePendingFrames;
    private assertUsable;
}
//# sourceMappingURL=batch-session.d.ts.map