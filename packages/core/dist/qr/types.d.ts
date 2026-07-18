import type { BarcodeFormat } from "@scanly/scenario-schema";
import type { EngineOutcome } from "../contracts/engine.js";
import type { ExecutionBudget } from "../runtime/execution-budget.js";
import type { FrameMemoryBudget } from "../runtime/memory-budget.js";
import type { EngineDiagnostic } from "../contracts/result.js";
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
/** Engine ids are plugin-defined and intentionally not a closed union. */
export type DecoderName = string;
export type ScaleLabel = "original" | "downscaled" | "upscaled" | "full";
export type CropPadding = "tight" | "medium" | "expanded";
export type RotationDegrees = 0 | 90 | 180 | 270;
export type DecodeErrorReason = "invalid_file" | "invalid_image" | "invalid_configuration" | "unsupported_image" | "no_qr_found" | "timeout" | "cancelled" | "worker_error" | "worker_initialization_failure" | "empty_image" | "image_too_large" | "camera_permission_denied" | "no_camera" | "unsupported_format" | "engine_initialization_failure" | "engine_execution_failure";
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
}
export interface DecodedCode {
    payload: string;
    format?: BarcodeFormat;
    /** Decoder-provided bytes; absent when the selected decoder cannot expose them. */
    rawBytes?: Uint8Array;
    decoder: DecoderName;
    engineVersion?: string;
    engineMetadata?: import("../contracts/engine.js").EngineExecutionMetadata;
    cornerPoints?: Array<{
        x: number;
        y: number;
    }>;
    symbologyIdentifier?: string;
    preprocessing: PreprocessMethod;
    candidateIndex: number;
    scale: ScaleLabel;
    rotation: RotationDegrees;
    /** Engine-provided symbol orientation normalized to the original frame. */
    symbolOrientation?: number;
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
    engineDiagnostics?: EngineDiagnostic[];
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
    engineDiagnostics?: EngineDiagnostic[];
    phaseTiming?: PhaseTiming;
}
export type DecodeOutcome = DecodeSuccess | DecodeFailure;
export interface DecoderConfig {
    /** Plugin ids, in deterministic aggregation order. */
    order: DecoderName[];
    execution: "sequential" | "parallel";
    failurePolicy?: "success-wins" | "required-engine-fails" | "any-engine-fails";
}
export interface PhaseTiming {
    frameNormalizationMs?: number;
    roiMs?: number;
    localizationMs?: number;
    candidateGenerationMs: number;
    candidateDeduplicationMs?: number;
    preprocessMs: number;
    rotationMs: number;
    validationMs?: number;
    semanticParsingMs?: number;
    workerTransferMs?: number;
    workerSetupMs?: number;
    cancellationLatencyMs?: number;
    engineMs?: Record<string, number>;
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
    resultDeduplication: "payload" | "payload-format" | "payload-format-spatial" | "tracked-instance";
    scales: number[];
    paddings: CropPadding[];
    rotations: RotationDegrees[];
    /** Ordered preprocess methods tried per candidate/scale/rotation combo (subset). */
    preprocessOrder: PreprocessMethod[];
    decoders: DecoderConfig;
    /** When native fallbacks enter the graph. Fast uses final; richer profiles use after-cheap. */
    fallbackTiming?: "after-cheap" | "final";
    /** Benchmark: all payloads that must appear for a full pass. */
    requiredPayloads?: string[];
    /** Benchmark: stop once this many unique payloads are found. */
    expectedResultCount?: number;
    /** Stop after this many consecutive candidates without a new payload (multiple mode). */
    stallCandidateLimit?: number;
    multiCodeStallPolicy?: MultiCodeStallPolicy;
    /** After this many failed attempts with no decode, skip heavy phases. */
    failFastAfterAttempts?: number;
    enableLocalization?: boolean;
    enableFullImageFallback?: boolean;
    enableSplitImageFallback?: boolean;
    enableGridImageFallback?: boolean;
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
    /** Required dependency-inverted engine boundary. */
    engineExecutor?: PipelineEngineExecutor;
    /** Internal graph path: candidates generated by upstream operators. */
    candidates?: import("./candidate-generation.js").CandidateImage[];
    /** Shared Router deadline/cancellation context. */
    executionBudget?: ExecutionBudget;
    /** Shared logical retained-buffer accounting for this frame. */
    memoryBudget?: FrameMemoryBudget;
}
export interface MultiCodeStallPolicy {
    maximumAttemptsWithoutNewResult: number;
    minimumCandidateCoverageBeforeStop: number;
    requireAllPrimaryCandidatesVisited: boolean;
}
export interface PipelineEngineExecutor {
    readonly engineIds: readonly string[];
    readonly versions?: Readonly<Record<string, string>>;
    decode(engineId: string, image: PixelBuffer, options: {
        signal?: AbortSignal;
        findMultiple: boolean;
        inversion?: "unknown" | "original" | "inverted";
    }): Promise<EngineOutcome>;
}
export declare const DEFAULT_PIPELINE_CONFIG: PipelineConfig;
export declare function validatePipelineConfig(config: PipelineConfig): string[];
//# sourceMappingURL=types.d.ts.map