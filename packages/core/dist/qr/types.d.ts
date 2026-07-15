/** Shared pixel buffer compatible with browser ImageData and Node raw buffers. */
export interface PixelBuffer {
    data: Uint8ClampedArray;
    width: number;
    height: number;
}
export type NonEmptyArray<T> = [T, ...T[]];
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface ScoredRegion extends Rect {
    score: number;
    index: number;
}
export type PreprocessMethod = "original" | "grayscale" | "contrast" | "gamma" | "invert" | "threshold-115" | "threshold-140" | "threshold-165" | "otsu" | "sharpen";
export type DecoderName = "jsqr" | "zxing";
export type ScaleLabel = "original" | "downscaled" | "upscaled" | "full";
export type CropPadding = "tight" | "medium" | "expanded";
export type RotationDegrees = 0 | 90 | 180 | 270;
export type DecodeErrorReason = "invalid_file" | "invalid_image" | "invalid_configuration" | "unsupported_image" | "no_qr_found" | "timeout" | "cancelled" | "worker_error" | "worker_initialization_failure" | "empty_image" | "image_too_large" | "camera_permission_denied" | "no_camera";
export interface DecodeAttempt {
    candidateIndex: number;
    candidateScore: number;
    cropPadding: CropPadding | "full";
    preprocessing: PreprocessMethod;
    scale: ScaleLabel;
    scaleFactor: number;
    rotation: RotationDegrees;
    decoder: DecoderName;
    elapsedMs: number;
    success: boolean;
    payload?: string;
}
export interface DecodedCode {
    payload: string;
    /** Decoder-provided bytes; absent when the selected decoder cannot expose them. */
    rawBytes?: Uint8Array;
    decoder: DecoderName;
    preprocessing: PreprocessMethod;
    candidateIndex: number;
    scale: ScaleLabel;
    rotation: RotationDegrees;
    cropPadding: CropPadding | "full";
    attemptIndex: number;
    /** Internal wall-clock offset used to report time to first result. */
    foundAtMs?: number;
}
export interface DecodeSuccess {
    ok: true;
    results: NonEmptyArray<DecodedCode>;
    /** Primary result — first unique successful decode. */
    primary: DecodedCode;
    attempts: DecodeAttempt[];
    attemptCount: number;
    elapsedMs: number;
    timeToFirstResultMs?: number;
    cancelled: boolean;
    phaseTiming?: PhaseTiming;
}
export interface DecodeFailure {
    ok: false;
    reason: DecodeErrorReason;
    message: string;
    attempts: DecodeAttempt[];
    attemptCount: number;
    elapsedMs: number;
    cancelled: boolean;
    phaseTiming?: PhaseTiming;
}
export type DecodeOutcome = DecodeSuccess | DecodeFailure;
export interface DecoderConfig {
    jsqr?: boolean;
    zxing?: boolean;
    /** When set, only these decoders run (in order). */
    decoderOrder?: DecoderName[];
}
export interface PhaseTiming {
    candidateGenerationMs: number;
    jsqrMs: number;
    zxingMs: number;
    preprocessMs: number;
    rotationMs: number;
    workerTransferMs?: number;
    workerSetupMs?: number;
    cancellationLatencyMs?: number;
}
export interface DecodeProgress {
    attemptCount: number;
}
export interface PipelineConfig {
    maxCandidates: number;
    maxAttempts: number;
    timeoutMs: number;
    maxPixels: number;
    previewSize: number;
    findMultiple: boolean;
    maxMultipleResults: number;
    scales: number[];
    paddings: CropPadding[];
    rotations: RotationDegrees[];
    /** Ordered preprocess methods tried per candidate/scale/rotation combo (subset). */
    preprocessOrder: PreprocessMethod[];
    decoders?: DecoderConfig;
    /** Benchmark: all payloads that must appear for a full pass. */
    requiredPayloads?: string[];
    /** Benchmark: stop once this many unique payloads are found. */
    expectedResultCount?: number;
    /** Stop after this many consecutive candidates without a new payload (multiple mode). */
    stallCandidateLimit?: number;
    /** After this many failed attempts with no decode, skip heavy phases. */
    failFastAfterAttempts?: number;
    enableLocalization?: boolean;
    enableFullImageFallback?: boolean;
    enableSplitImageFallback?: boolean;
    /** Bounded per-frame retained preprocessing cache; never global. */
    maxIntermediateAllocations?: number;
    maxIntermediateBytes?: number;
}
export interface DecodePipelineOptions {
    signal?: AbortSignal;
    config?: Partial<PipelineConfig>;
    onStage?: (stage: string) => void;
    onProgress?: (progress: DecodeProgress) => void;
    /** If true, run on main thread (Node/tests). Browser upload uses Worker. */
    forceMainThread?: boolean;
}
export declare const DEFAULT_PIPELINE_CONFIG: PipelineConfig;
export declare function validatePipelineConfig(config: PipelineConfig): string[];
//# sourceMappingURL=types.d.ts.map