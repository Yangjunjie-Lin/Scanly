/** Shared pixel buffer compatible with browser ImageData and Node raw buffers. */
export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

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

export type DecoderName = "jsqr" | "zxing";

export type ScaleLabel = "original" | "downscaled" | "upscaled" | "full";

export type CropPadding = "tight" | "medium" | "expanded";

export type RotationDegrees = 0 | 90 | 180 | 270;

export type DecodeErrorReason =
  | "invalid_file"
  | "unsupported_image"
  | "no_qr_found"
  | "timeout"
  | "cancelled"
  | "worker_error"
  | "empty_image"
  | "camera_permission_denied"
  | "no_camera";

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
  decoder: DecoderName;
  preprocessing: PreprocessMethod;
  candidateIndex: number;
  scale: ScaleLabel;
  rotation: RotationDegrees;
  cropPadding: CropPadding | "full";
  attemptIndex: number;
}

export interface DecodeSuccess {
  ok: true;
  results: DecodedCode[];
  /** Primary result — first unique successful decode. */
  primary: DecodedCode;
  attempts: DecodeAttempt[];
  attemptCount: number;
  elapsedMs: number;
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
}

export interface DecodePipelineOptions {
  signal?: AbortSignal;
  config?: Partial<PipelineConfig>;
  onStage?: (stage: string) => void;
  onProgress?: (progress: DecodeProgress) => void;
  /** If true, run on main thread (Node/tests). Browser upload uses Worker. */
  forceMainThread?: boolean;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  maxCandidates: 5,
  maxAttempts: 96,
  timeoutMs: 12_000,
  maxPixels: 4_000_000,
  previewSize: 400,
  findMultiple: true,
  maxMultipleResults: 8,
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
  decoders: { jsqr: true, zxing: true },
  stallCandidateLimit: 12,
  failFastAfterAttempts: 48,
};
