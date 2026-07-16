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

export type PreprocessMethod =
  | "original"
  | "grayscale"
  | "contrast"
  | "gamma"
  | "invert"
  | "threshold-115"
  | "threshold-140"
  | "threshold-165"
  | "otsu"
  | "sharpen";

/** Engine ids are plugin-defined and intentionally not a closed union. */
export type DecoderName = string;

export type ScaleLabel = "original" | "downscaled" | "upscaled" | "full";

export type CropPadding = "tight" | "medium" | "expanded";

export type RotationDegrees = 0 | 90 | 180 | 270;

export type DecodeErrorReason =
  | "invalid_file"
  | "invalid_image"
  | "invalid_configuration"
  | "unsupported_image"
  | "no_qr_found"
  | "timeout"
  | "cancelled"
  | "worker_error"
  | "worker_initialization_failure"
  | "empty_image"
  | "image_too_large"
  | "camera_permission_denied"
  | "no_camera"
  | "unsupported_format"
  | "engine_initialization_failure"
  | "engine_execution_failure";

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
  cornerPoints?: Array<{ x: number; y: number }>;
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
  decode(engineId: string, image: PixelBuffer, options: { signal?: AbortSignal; findMultiple: boolean; inversion?: "unknown" | "original" | "inverted" }): Promise<EngineOutcome>;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  maxCandidates: 5,
  maxAttempts: 96,
  timeoutMs: 12_000,
  maxPixels: 4_000_000,
  previewSize: 400,
  findMultiple: true,
  maxMultipleResults: 8,
  resultDeduplication: "payload-format-spatial",
  scales: [1, 0.7, 1.35],
  paddings: ["medium", "expanded", "tight"],
  rotations: [0, 90, 180, 270],
  preprocessOrder: [
    "original",
    "contrast",
    "invert",
    "otsu",
    "threshold-140",
    "gamma",
    "sharpen",
    "threshold-115",
    "threshold-165",
  ],
  decoders: { order: [], execution: "sequential", failurePolicy: "success-wins" },
  stallCandidateLimit: 12,
  failFastAfterAttempts: 48,
  enableLocalization: true,
  enableFullImageFallback: true,
  enableSplitImageFallback: true,
  enableGridImageFallback: true,
  maxIntermediateAllocations: 24,
  maxIntermediateBytes: 64 * 1024 * 1024,
};

export function validatePipelineConfig(config: PipelineConfig): string[] {
  const issues: string[] = [];
  for (const key of ["maxCandidates", "maxAttempts", "timeoutMs", "maxPixels", "previewSize", "maxMultipleResults", "maxIntermediateAllocations", "maxIntermediateBytes"] as const) {
    const value = config[key];
    if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 1) issues.push(`${key} must be a positive integer.`);
  }
  if (config.scales.length === 0 || config.scales.some((scale) => !Number.isFinite(scale) || scale <= 0 || scale > 4)) issues.push("scales must contain finite values greater than 0 and at most 4.");
  if (config.paddings.length === 0) issues.push("paddings must not be empty.");
  if (config.rotations.length === 0) issues.push("rotations must not be empty.");
  if (config.preprocessOrder.length === 0) issues.push("preprocessOrder must not be empty.");
  if (!Array.isArray(config.decoders.order) || config.decoders.order.length === 0) issues.push("decoders.order must contain at least one registered engine id.");
  if (config.decoders.execution !== "sequential" && config.decoders.execution !== "parallel") issues.push("decoders.execution must be sequential or parallel.");
  if (config.multiCodeStallPolicy) {
    if (!Number.isInteger(config.multiCodeStallPolicy.maximumAttemptsWithoutNewResult) || config.multiCodeStallPolicy.maximumAttemptsWithoutNewResult < 1) issues.push("multiCodeStallPolicy.maximumAttemptsWithoutNewResult must be a positive integer.");
    if (!Number.isFinite(config.multiCodeStallPolicy.minimumCandidateCoverageBeforeStop) || config.multiCodeStallPolicy.minimumCandidateCoverageBeforeStop < 0 || config.multiCodeStallPolicy.minimumCandidateCoverageBeforeStop > 1) issues.push("multiCodeStallPolicy.minimumCandidateCoverageBeforeStop must be between 0 and 1.");
    if (typeof config.multiCodeStallPolicy.requireAllPrimaryCandidatesVisited !== "boolean") issues.push("multiCodeStallPolicy.requireAllPrimaryCandidatesVisited must be boolean.");
  }
  return issues;
}
