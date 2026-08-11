import type { DecodedBarcode } from "@scanly/core";
import type { BarcodeGeometry } from "../scanner/types.js";
/** Lifecycle of one physical barcode identity. */
export type BarcodeTrackState = "tentative" | "confirmed" | "lost" | "retired";
/**
 * One decoder observation in a frame. Observations deliberately do not carry
 * identity: assigning a stable physical identity is BarcodeTracker's job.
 */
export interface BarcodeObservation {
    payload: string;
    format: DecodedBarcode["format"];
    geometry: BarcodeGeometry;
    confidence?: number;
}
/** Stable, SDK-owned view of a physical barcode instance. */
export interface BarcodeTrack {
    trackId: string;
    payload: string;
    format: DecodedBarcode["format"];
    state: BarcodeTrackState;
    firstSeenAt: number;
    lastSeenAt: number;
    firstFrameId: number;
    lastFrameId: number;
    observationCount: number;
    missedFrameCount: number;
    geometry: BarcodeGeometry;
    /** Center displacement in image coordinates per processed frame. */
    velocity?: {
        x: number;
        y: number;
    };
    physicalInstanceId: string;
}
export interface TrackingFrame {
    frameId: number;
    timestamp: number;
}
export interface BarcodeTrackerOptions {
    /** Maximum live (tentative, confirmed, or lost) identities. */
    maxTracks?: number;
    /** Public scanner-facing alias for maxTracks. maxTracks takes precedence. */
    maxTrackedBarcodes?: number;
    /** Maximum observations considered from any one frame. */
    maxObservations?: number;
    /** Maximum accepted association cost. */
    associationThreshold?: number;
    /** Observations required before a new identity is confirmed. */
    confirmationObservations?: number;
    /** Consecutive missing frames retained for occlusion recovery. */
    maxMissedFrames?: number;
    /** EMA weight applied to the newest measured velocity. */
    velocitySmoothing?: number;
    association?: Partial<TrackAssociationWeights>;
}
export interface TrackAssociationWeights {
    payloadMismatch: number;
    formatMismatch: number;
    spatialDistance: number;
    iouPenalty: number;
    geometrySize: number;
    motionPrediction: number;
    timeSinceObservation: number;
}
export interface TrackAssociationMatch {
    trackIndex: number;
    observationIndex: number;
    cost: number;
}
export interface TrackAssociationResult {
    matches: readonly TrackAssociationMatch[];
    unmatchedTrackIndices: readonly number[];
    unmatchedObservationIndices: readonly number[];
    /** Rows are tracks and columns are observations. */
    costMatrix: readonly (readonly number[])[];
}
export interface BarcodeTrackerUpdate {
    frameId: number;
    timestamp: number;
    matchedTracks: readonly BarcodeTrack[];
    newTracks: readonly BarcodeTrack[];
    updatedTracks: readonly BarcodeTrack[];
    lostTracks: readonly BarcodeTrack[];
    restoredTracks: readonly BarcodeTrack[];
    retiredTracks: readonly BarcodeTrack[];
    tracks: readonly BarcodeTrack[];
    ignoredObservationCount: number;
    association: TrackAssociationResult;
}
export interface TrackingStatistics {
    processedFrames: number;
    receivedObservations: number;
    consideredObservations: number;
    ignoredObservations: number;
    matchedObservationCount: number;
    createdTrackCount: number;
    confirmedTrackCount: number;
    lostTransitionCount: number;
    restoredTrackCount: number;
    retiredTrackCount: number;
    activeTrackCount: number;
    lostTrackCount: number;
    pendingObservationCount: number;
    peakTrackCount: number;
    associationP50Ms: number;
    associationP95Ms: number;
}
export interface TrackROIFrame {
    frameId: number;
    width: number;
    height: number;
}
export interface TrackROI {
    trackId: string;
    state: BarcodeTrackState;
    x: number;
    y: number;
    width: number;
    height: number;
    predicted: boolean;
    missCount: number;
}
export interface TrackROIPlan {
    frameId: number;
    trackedROIs: readonly TrackROI[];
    uncoveredRegions: readonly Omit<TrackROI, "trackId" | "state" | "predicted" | "missCount">[];
    includeFullFrame: boolean;
    phases: readonly ("tracked-rois" | "uncovered-regions" | "full-frame")[];
}
export interface TrackROISetOptions {
    /** Maximum input candidates inspected before ROI prioritization. */
    maxCandidateTracks?: number;
    maxROIs?: number;
    expansion?: number;
    missedFrameExpansion?: number;
    globalScanIntervalFrames?: number;
    uncoveredGridSize?: number;
    maxUncoveredRegions?: number;
}
/** Renderer-neutral overlay data; Canvas/SVG ownership stays with applications. */
export interface TrackOverlayModel {
    trackId: string;
    physicalInstanceId: string;
    payload: string;
    format: DecodedBarcode["format"];
    state: BarcodeTrackState;
    boundingBox: BarcodeGeometry["boundingBox"];
    cornerPoints: BarcodeGeometry["cornerPoints"];
    velocity?: {
        x: number;
        y: number;
    };
}
//# sourceMappingURL=types.d.ts.map