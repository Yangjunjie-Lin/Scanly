import type { CornerPoint, DecodedBarcode, NormalizedFrame, ScanOutcome, ScannerRecoveryDiagnosticSnapshot, SdkError } from "@scanly/core";
export type ScannerSessionState = "idle" | "starting" | "scanning" | "paused" | "stopping" | "stopped" | "failed";
export type DecodeProfile = "fast" | "balanced" | "robust";
export type ScannerDecodeMode = "single" | "tracking";
export type ScannerDecodeROIPhase = "temporal" | "tracked-rois" | "uncovered-regions" | "full-frame";
export type ConfirmationMode = "immediate" | "confirm-two" | "adaptive";
export interface BarcodeGeometry {
    cornerPoints: readonly CornerPoint[];
    boundingBox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    frameWidth?: number;
    frameHeight?: number;
}
export interface FrameQuality {
    blurScore: number;
    brightness: number;
    contrast: number;
    glareRatio: number;
    edgeDensity: number;
    motionEstimate?: number;
    underexposed: boolean;
    overexposed: boolean;
    blurred: boolean;
    glareDominated: boolean;
    usable: boolean;
}
export interface TemporalCandidate {
    key: string;
    payload: string;
    format: DecodedBarcode["format"];
    firstSeenAt: number;
    lastSeenAt: number;
    observationCount: number;
    stableCount: number;
    latestGeometry?: BarcodeGeometry;
}
export interface RepeatPolicy {
    mode: "allow" | "cooldown" | "once-per-session" | "physical-instance";
    cooldownMs?: number;
    spatialSeparationRatio?: number;
    disappearanceMs?: number;
}
export interface ScanEvent {
    id: string;
    type: "detected" | "confirmed" | "emitted" | "suppressed" | "lost";
    barcode: DecodedBarcode;
    frameId: number;
    timestamp: number;
    observationCount: number;
    geometry?: BarcodeGeometry;
    physicalInstanceId?: string;
    suppressionReason?: string;
}
/** All valid decoder observations produced for one admitted frame. */
export interface ScannerBarcodeObservation {
    barcode: DecodedBarcode;
    frameId: number;
    timestamp: number;
    geometry?: BarcodeGeometry;
}
/** Frame-level observation boundary consumed by multi-target tracking. */
export interface BarcodeObservationSet {
    frameId: number;
    timestamp: number;
    frameWidth: number;
    frameHeight: number;
    generation: number;
    quality: FrameQuality;
    decodeMode?: ScannerDecodeMode;
    roiPhase?: ScannerDecodeROIPhase;
    profile?: DecodeProfile;
    decodeMs?: number;
    observations: readonly ScannerBarcodeObservation[];
}
export type ScannerHintType = "move_closer" | "move_farther" | "hold_steady" | "increase_light" | "reduce_glare" | "barcode_too_small" | "searching";
export interface ScannerHint {
    type: ScannerHintType;
    confidence: number;
}
export interface ScannerSessionStatistics {
    capturedFrames: number;
    admittedFrames: number;
    droppedFrames: number;
    qualityRejectedFrames: number;
    periodicProbeFrames: number;
    fastAttempts: number;
    balancedAttempts: number;
    robustAttempts: number;
    decodeSuccesses: number;
    confirmedEvents: number;
    emittedEvents: number;
    suppressedRepeats: number;
    staleResultsDiscarded: number;
    staleEvents: number;
    lostEvents: number;
    averageDecodeMs: number;
    p95DecodeMs: number;
    effectiveDecodeFps: number;
    frameDropRate: number;
    timeToFirstDecodeMs?: number;
    timeToFirstConfirmedScanMs?: number;
    currentWorkerMemory?: number;
    peakControlledMemory?: number;
    activeDecodeCount: number;
    pendingFrameCount: number;
    peakPendingFrameCount: number;
    workerCreatedCount: number;
    workerTerminatedCount: number;
    activeTaskCount: number;
    peakActiveTaskCount: number;
    workerWasmDecodeCount: number;
    wasmInputAllocationBytes: number;
    wasmActiveNativeResultCount: number;
    wasmPeakLinearMemoryBytes: number;
    wasmReleasedNativeResultCount: number;
    finalControlledMemory: number;
    recoveryRunCount: number;
    recoveryTemporaryBytes: number;
    recoveryPeakTemporaryBytes: number;
    recoveryRouteStateCount: number;
}
export interface ScannerDiagnostic {
    type: "frame-quality" | "hint" | "event" | "decode" | "recovery" | "scheduler" | "error";
    timestamp: number;
    frameId?: number;
    quality?: FrameQuality;
    hint?: ScannerHint;
    event?: ScanEvent;
    profile?: DecodeProfile;
    decodeMs?: number;
    error?: SdkError;
    detail?: string;
    recovery?: ScannerRecoveryDiagnosticSnapshot;
}
export interface TemporalROIHint {
    x: number;
    y: number;
    width: number;
    height: number;
    ageMs: number;
    missCount: number;
}
export interface ScannerDecodeRequest {
    profile: DecodeProfile;
    quality: FrameQuality;
    /** Defaults to the Beta 1 single-result behavior for third-party decoders. */
    mode?: ScannerDecodeMode;
    /** Bounded result ceiling used by tracking-aware multi-code decoders. */
    maxResults?: number;
    /** Identifies how the optional ROI was selected for this frame. */
    roiPhase?: ScannerDecodeROIPhase;
    roi?: TemporalROIHint;
    signal: AbortSignal;
    generation: number;
}
export interface ScannerDecoderStatistics {
    workerCreatedCount: number;
    workerTerminatedCount: number;
    activeTaskCount: number;
    peakActiveTaskCount: number;
    wasmObservationCount?: number;
    workerWasmDecodeCount?: number;
    wasmInputAllocationBytes?: number;
    wasmActiveNativeResultCount?: number;
    wasmCurrentLinearMemoryBytes?: number;
    wasmPeakLinearMemoryBytes?: number;
    wasmReleasedNativeResultCount?: number;
    recoveryRunCount?: number;
    recoveryTemporaryBytes?: number;
    recoveryPeakTemporaryBytes?: number;
    recoveryRouteStateCount?: number;
}
export interface ScannerFrameDecoder {
    decode(frame: NormalizedFrame, request: ScannerDecodeRequest): Promise<ScanOutcome>;
    cancel(): void;
    dispose(): Promise<void> | void;
    getStatistics?(): ScannerDecoderStatistics;
}
export interface CameraFrameSource {
    start(onFrame: (frame: NormalizedFrame) => Promise<void> | void, onError: (error: unknown) => void, onEnded: () => void): Promise<void>;
    pause?(): void;
    resume?(): void;
    stop(): Promise<void> | void;
}
export type ScanResultListener = (event: ScanEvent) => void;
export type BarcodeObservationSetListener = (set: BarcodeObservationSet) => void;
export type ScannerStateListener = (state: ScannerSessionState) => void;
export type ScannerDiagnosticListener = (diagnostic: ScannerDiagnostic) => void;
export type Unsubscribe = () => void;
export interface CapabilitySuccess<T> {
    ok: true;
    value: T;
}
export interface CapabilityFailure {
    ok: false;
    error: SdkError;
}
export type CapabilityResult<T> = CapabilitySuccess<T> | CapabilityFailure;
export interface CameraCapabilities {
    torch: boolean;
    zoom?: {
        min: number;
        max: number;
        step?: number;
        current?: number;
    };
    focusMode: boolean;
    width?: number;
    height?: number;
    deviceId?: string;
}
export interface AutoZoomOptions {
    enabled?: boolean;
    minimumBarcodeAreaRatio?: number;
    cooldownMs?: number;
    maximumZoomDelta?: number;
}
//# sourceMappingURL=types.d.ts.map