import type { BarcodeTrack, BarcodeTrackerUpdate } from "../tracking/types.js";
import type { BatchEventListener, BatchMode, BatchState, BatchStatistics, BatchUnsubscribe, ExpectedBatchItem, TrackListener } from "./types.js";
export interface BatchControllerOptions {
    mode?: BatchMode;
    expectedCount?: number;
    expected?: readonly ExpectedBatchItem[];
    /** Maximum live track snapshots retained by the batch view. Defaults to 64. */
    maxRetainedTracks?: number;
    /**
     * Maximum confirmed physical-instance snapshots retained for completion and
     * classification. Defaults to 256 and may not exceed 4096.
     */
    maxRetainedPhysicalInstances?: number;
}
export declare const DEFAULT_BATCH_MAX_RETAINED_TRACKS = 64;
export declare const DEFAULT_BATCH_MAX_RETAINED_PHYSICAL_INSTANCES = 256;
export declare const MAX_BATCH_RETENTION_LIMIT = 4096;
/**
 * Pure batch state machine. It consumes tracker updates and never counts raw
 * decoder events, so repeated observations cannot complete a batch early.
 */
export declare class BatchController {
    private readonly mode;
    private readonly expectedCount?;
    private readonly expectedSlots;
    private readonly maxRetainedTracks;
    private readonly maxRetainedPhysicalInstances;
    private readonly tracks;
    private readonly confirmedByPhysicalInstance;
    private readonly unexpectedByPhysicalInstance;
    private readonly duplicateByPhysicalInstance;
    private readonly trackListeners;
    private readonly eventListeners;
    private status;
    private completedAt?;
    private failureReason?;
    private counters;
    constructor(options?: BatchControllerOptions);
    getTracks(): readonly BarcodeTrack[];
    getState(): BatchState;
    getStatistics(): BatchStatistics;
    onTrack(listener: TrackListener): BatchUnsubscribe;
    onEvent(listener: BatchEventListener): BatchUnsubscribe;
    /** Apply one complete, frame-level BarcodeTracker update. */
    applyTrackerUpdate(update: BarcodeTrackerUpdate): void;
    /**
     * Convenience for adapters/tests that already own stable tracker snapshots.
     * Each supplied confirmed track is still de-duplicated by physical identity.
     */
    applyTracks(tracks: readonly BarcodeTrack[], timestamp?: number): void;
    cancel(): void;
    fail(error: unknown): void;
    reset(): void;
    /**
     * Release frame-derived evidence while preserving terminal status and
     * aggregate counters. A subsequent start() calls reset() for a fresh batch.
     */
    releaseRetainedState(): void;
    clear(): void;
    private upsertTrack;
    private confirmPhysicalTrack;
    private evictOldestNonMatchedPhysicalInstance;
    private recordRetentionPeaks;
    private classifyChecklistTrack;
    private completeIfSatisfied;
    private matchedItems;
    private missingItems;
    private emitTrack;
    private emit;
}
//# sourceMappingURL=batch-controller.d.ts.map