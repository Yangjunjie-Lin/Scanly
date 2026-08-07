import { SDK_ERROR_CODES, validateFrame, type ScanOutcome, type ScanResult, type ScanTiming } from "@scanly/core";
import { validateScenario, type ScenarioDefinition } from "@scanly/scenario-schema";
import { fromTransferableFrame, type SerializedNormalizedFrame } from "./transferable-buffer.js";

export type WorkerRequest =
  | { type: "scan"; jobId: string; generation: number; frame: SerializedNormalizedFrame; scenario: ScenarioDefinition; progress: boolean }
  | { type: "cancel"; jobId: string; generation: number };

/** Live ZXing-C++ resources observed inside the Worker realm after a decode. */
export interface WorkerWasmMemoryObservation {
  initialLinearMemoryBytes: number;
  currentLinearMemoryBytes: number;
  peakLinearMemoryBytes: number;
  inputAllocationBytes: number;
  peakInputAllocationBytes: number;
  activeNativeResultCount: number;
  releasedNativeResultCount: number;
}

export type WorkerResponse =
  | { type: "stage"; jobId: string; generation: number; stage: string }
  | { type: "progress"; jobId: string; generation: number; attemptCount: number }
  | { type: "result"; jobId: string; generation: number; outcome: ScanOutcome; wasmMemory?: WorkerWasmMemoryObservation }
  | { type: "cancelled"; jobId: string; generation: number; elapsedMs: number }
  | { type: "error"; jobId: string; generation: number; message: string };

function objectWithJobId(value: unknown): value is Record<string, unknown> & { jobId: string } {
  return Boolean(value) && typeof value === "object" && typeof (value as { jobId?: unknown }).jobId === "string" && (value as { jobId: string }).jobId.length > 0 && (value as { jobId: string }).jobId.length <= 128;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBoundedString(value: unknown, maximumLength: number, allowEmpty = true): value is string {
  return typeof value === "string" && (allowEmpty || value.length > 0) && value.length <= maximumLength;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isBoundedStringArray(value: unknown, maximumItems: number, maximumLength: number): value is string[] {
  return Array.isArray(value)
    && value.length <= maximumItems
    && value.every((entry) => isBoundedString(entry, maximumLength));
}

const BARCODE_FORMATS = new Set([
  "qr_code", "data_matrix", "pdf417", "code_128", "ean_8", "ean_13", "upc_a", "upc_e",
]);
const BARCODE_FORMAT_CLASSES = new Set(["matrix", "stacked", "linear"]);
const SDK_ERROR_CODE_VALUES = new Set<string>(SDK_ERROR_CODES);
const SDK_ERROR_CATEGORIES = new Set(["input", "resource", "lifecycle", "engine", "source", "configuration", "internal"]);

function isScanTiming(value: unknown): value is ScanTiming {
  if (!isRecord(value) || !isNonNegativeNumber(value.totalMs)) return false;
  const optionalDurations = [
    "timeToFirstResultMs",
    "frameNormalizationMs",
    "roiMs",
    "localizationMs",
    "candidateGenerationMs",
    "candidateDeduplicationMs",
    "preprocessingMs",
    "rotationMs",
    "decodingMs",
    "validationMs",
    "semanticParsingMs",
    "workerSetupMs",
    "workerTransferMs",
  ];
  if (optionalDurations.some((key) => value[key] !== undefined && !isNonNegativeNumber(value[key]))) return false;
  if (value.engineMs !== undefined) {
    if (!isRecord(value.engineMs) || Object.keys(value.engineMs).length > 64) return false;
    if (!Object.entries(value.engineMs).every(([engineId, duration]) => isBoundedString(engineId, 128, false) && isNonNegativeNumber(duration))) return false;
  }
  if (value.controlledMemory !== undefined) {
    if (!isRecord(value.controlledMemory)) return false;
    const memoryKeys = [
      "currentControlledBytes",
      "peakControlledBytes",
      "retainedArtifactBytes",
      "retainedCacheBytes",
      "transientScratchBytes",
    ];
    if (!memoryKeys.every((key) => isNonNegativeInteger((value.controlledMemory as Record<string, unknown>)[key]))) return false;
  }
  return true;
}

function isStructuredPayload(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value)
    || !isBoundedString(value.kind, 64, false)
    || value.parserVersion !== "1.0"
    || !isRecord(value.fields)
    || Object.keys(value.fields).length > 128
    || !isBoundedStringArray(value.warnings, 64, 2_048)) return false;
  return Object.values(value.fields).every((field) => {
    if (field === null || typeof field === "number" || typeof field === "boolean") return true;
    if (isBoundedString(field, 65_536)) return true;
    return isBoundedStringArray(field, 256, 65_536);
  });
}

function isScanResult(value: unknown): value is ScanResult {
  if (!isRecord(value)
    || !BARCODE_FORMATS.has(value.format as string)
    || !isBoundedString(value.rawText, 65_536)
    || !isBoundedString(value.frameId, 128, false)
    || !isRecord(value.engine)
    || !isBoundedString(value.engine.id, 128, false)
    || !isBoundedString(value.engine.version, 128, false)
    || !isBoundedStringArray(value.preprocessingPath, 64, 256)
    || !isStructuredPayload(value.structuredPayload)
    || !isRecord(value.validation)
    || typeof value.validation.valid !== "boolean"
    || !isBoundedStringArray(value.validation.validatorIds, 64, 128)
    || !isBoundedStringArray(value.validation.messages, 64, 2_048)
    || !isBoundedStringArray(value.warnings, 64, 2_048)
    || !isScanTiming(value.timing)) return false;

  if (value.formatClass !== undefined && !BARCODE_FORMAT_CLASSES.has(value.formatClass as string)) return false;
  if (value.rawBytes !== undefined && (!(value.rawBytes instanceof Uint8Array) || value.rawBytes.byteLength > 64 * 1024 * 1024)) return false;
  if (value.cornerPoints !== undefined && (!Array.isArray(value.cornerPoints)
    || value.cornerPoints.length > 64
    || !value.cornerPoints.every((point) => isRecord(point) && typeof point.x === "number" && Number.isFinite(point.x) && typeof point.y === "number" && Number.isFinite(point.y)))) return false;
  if (value.orientation !== undefined && (typeof value.orientation !== "number" || !Number.isFinite(value.orientation))) return false;
  if (value.symbologyIdentifier !== undefined && !isBoundedString(value.symbologyIdentifier, 128)) return false;
  if (value.isGs1 !== undefined && typeof value.isGs1 !== "boolean") return false;
  if (value.metadata !== undefined && !isRecord(value.metadata)) return false;
  return true;
}

function isSdkError(value: unknown): boolean {
  if (!isRecord(value)
    || !SDK_ERROR_CODE_VALUES.has(value.code as string)
    || !SDK_ERROR_CATEGORIES.has(value.category as string)
    || !isBoundedString(value.message, 2_048, false)
    || typeof value.retryable !== "boolean") return false;
  if (value.details === undefined) return true;
  return isRecord(value.details)
    && Object.keys(value.details).length <= 64
    && Object.values(value.details).every((detail) => detail === null
      || typeof detail === "boolean"
      || (typeof detail === "number" && Number.isFinite(detail))
      || isBoundedString(detail, 65_536));
}

function isScanOutcome(value: unknown): value is ScanOutcome {
  if (!isRecord(value)
    || typeof value.ok !== "boolean"
    || !isBoundedString(value.frameId, 128, false)
    || !isBoundedString(value.scenarioId, 64, false)
    || !isNonNegativeInteger(value.attemptCount)
    || !isScanTiming(value.timing)) return false;

  if (!value.ok) return isSdkError(value.error);
  if (!Array.isArray(value.results) || value.results.length === 0 || value.results.length > 64) return false;
  if (!value.results.every((result) => isScanResult(result) && result.frameId === value.frameId)) return false;
  const primary = value.primary;
  if (!isScanResult(primary) || primary.frameId !== value.frameId) return false;
  return value.results.some((result) => result.format === primary.format
    && result.rawText === primary.rawText
    && result.frameId === primary.frameId);
}

export function isWorkerRequest(value: unknown): value is WorkerRequest {
  if (!objectWithJobId(value) || (value.type !== "scan" && value.type !== "cancel")) return false;
  if (!Number.isSafeInteger(value.generation) || (value.generation as number) < 0) return false;
  if (value.type === "cancel") return true;
  if (typeof value.progress !== "boolean" || !value.frame || typeof value.frame !== "object" || !(value.frame as { buffer?: unknown }).buffer || !((value.frame as { buffer: unknown }).buffer instanceof ArrayBuffer)) return false;
  const frame = fromTransferableFrame(value.frame as SerializedNormalizedFrame);
  if (validateFrame(frame).length) return false;
  return validateScenario(value.scenario).ok;
}

export function isWorkerResponse(value: unknown): value is WorkerResponse {
  try {
    if (!objectWithJobId(value) || typeof value.type !== "string") return false;
    if (!isNonNegativeInteger(value.generation)) return false;
    if (value.type === "stage") return isBoundedString(value.stage, 256);
    if (value.type === "progress") return isNonNegativeInteger(value.attemptCount);
    if (value.type === "cancelled") return isNonNegativeNumber(value.elapsedMs);
    if (value.type === "error") return isBoundedString(value.message, 2_048, false);
    if (value.type !== "result" || !isScanOutcome(value.outcome)) return false;
    return value.wasmMemory === undefined || isWorkerWasmMemoryObservation(value.wasmMemory);
  } catch {
    // Worker messages cross an untrusted realm boundary. Validation must never
    // let malformed data escape as an exception into the session lifecycle.
    return false;
  }
}

function isWorkerWasmMemoryObservation(value: unknown): value is WorkerWasmMemoryObservation {
  if (!value || typeof value !== "object") return false;
  const observation = value as Record<string, unknown>;
  return [
    "initialLinearMemoryBytes",
    "currentLinearMemoryBytes",
    "peakLinearMemoryBytes",
    "inputAllocationBytes",
    "peakInputAllocationBytes",
    "activeNativeResultCount",
    "releasedNativeResultCount",
  ].every((key) => isNonNegativeInteger(observation[key]));
}
