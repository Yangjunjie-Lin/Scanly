import type { BarcodeFormat } from "@scanly/core";
import type { BarcodeTrack } from "../tracking/types.js";
/** Batch behavior is orthogonal to camera capture and frame scheduling. */
export type BatchMode = "continuous" | "expected-count" | "checklist" | "unique-physical-instance";
export type BatchStatus = "collecting" | "complete" | "failed" | "cancelled";
export interface ExpectedBatchItem {
    payload: string;
    format?: BarcodeFormat;
    /** Defaults to one. Quantities are physical instances, not decoder events. */
    quantity?: number;
}
export interface BatchMatchedItem {
    item: ExpectedBatchItem;
    track: BarcodeTrack;
}
export interface BatchMissingItem {
    item: ExpectedBatchItem;
    quantity: number;
}
export interface BatchState {
    mode: BatchMode;
    status: BatchStatus;
    expectedCount?: number;
    confirmedPhysicalInstanceCount: number;
    matched: readonly BatchMatchedItem[];
    missing: readonly BatchMissingItem[];
    unexpected: readonly BarcodeTrack[];
    duplicate: readonly BarcodeTrack[];
    completedAt?: number;
    failureReason?: string;
}
export type TrackEvent = {
    type: "track-added";
    track: BarcodeTrack;
} | {
    type: "track-updated";
    track: BarcodeTrack;
} | {
    type: "track-lost";
    trackId: string;
    track: BarcodeTrack;
} | {
    type: "track-restored";
    track: BarcodeTrack;
} | {
    type: "track-retired";
    trackId: string;
    track: BarcodeTrack;
};
export type BatchEvent = TrackEvent | {
    type: "item-matched";
    item: ExpectedBatchItem;
    track: BarcodeTrack;
} | {
    type: "unexpected-item";
    track: BarcodeTrack;
} | {
    type: "duplicate-item";
    item: ExpectedBatchItem;
    track: BarcodeTrack;
} | {
    type: "batch-completed";
    state: BatchState;
} | {
    type: "batch-cancelled";
    state: BatchState;
} | {
    type: "batch-failed";
    state: BatchState;
    error: unknown;
};
export interface BatchStatistics {
    confirmedPhysicalInstanceCount: number;
    maxRetainedTracks: number;
    maxRetainedPhysicalInstances: number;
    /** Current bounded controller snapshots, exposed for memory evidence. */
    retainedTrackCount: number;
    retainedPhysicalInstanceCount: number;
    peakRetainedTrackCount: number;
    peakRetainedPhysicalInstanceCount: number;
    peakUnexpectedQuantity: number;
    peakDuplicateQuantity: number;
    retentionRejectedTrackCount: number;
    retentionRejectedPhysicalInstanceCount: number;
    retentionEvictedPhysicalInstanceCount: number;
    matchedQuantity: number;
    missingQuantity: number;
    unexpectedQuantity: number;
    duplicateQuantity: number;
    trackAddedEvents: number;
    trackUpdatedEvents: number;
    trackLostEvents: number;
    trackRestoredEvents: number;
    trackRetiredEvents: number;
    batchCompletedEvents: number;
    completionAccuracy: number;
}
export type TrackListener = (event: TrackEvent) => void;
export type BatchEventListener = (event: BatchEvent) => void;
export type BatchUnsubscribe = () => void;
//# sourceMappingURL=types.d.ts.map