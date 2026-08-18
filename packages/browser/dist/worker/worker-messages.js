import { SDK_ERROR_CODES, validateBudget, validateFrame } from "@scanly/core";
import { validateScenario } from "@scanly/scenario-schema";
import { fromTransferableFrame } from "./transferable-buffer.js";
function objectWithJobId(value) {
    return Boolean(value) && typeof value === "object" && typeof value.jobId === "string" && value.jobId.length > 0 && value.jobId.length <= 128;
}
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isBoundedString(value, maximumLength, allowEmpty = true) {
    return typeof value === "string" && (allowEmpty || value.length > 0) && value.length <= maximumLength;
}
function isNonNegativeNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function isNonNegativeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
}
function isBoundedStringArray(value, maximumItems, maximumLength) {
    return Array.isArray(value)
        && value.length <= maximumItems
        && value.every((entry) => isBoundedString(entry, maximumLength));
}
const BARCODE_FORMATS = new Set([
    "qr_code", "data_matrix", "pdf417", "code_128", "ean_8", "ean_13", "upc_a", "upc_e",
]);
const BARCODE_FORMAT_CLASSES = new Set(["matrix", "stacked", "linear"]);
const SDK_ERROR_CODE_VALUES = new Set(SDK_ERROR_CODES);
const SDK_ERROR_CATEGORIES = new Set(["input", "resource", "lifecycle", "engine", "source", "configuration", "internal"]);
const RECOVERY_PROFILES = new Set(["fast", "balanced", "robust", "industrial", "dpm-experimental"]);
const RECOVERY_ROUTES = new Set(["general", "low-contrast", "illumination", "blur", "glare", "perspective", "curved", "small-module", "damaged", "quiet-zone", "screen", "dpm"]);
function isScanTiming(value) {
    if (!isRecord(value) || !isNonNegativeNumber(value.totalMs))
        return false;
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
    if (optionalDurations.some((key) => value[key] !== undefined && !isNonNegativeNumber(value[key])))
        return false;
    if (value.engineMs !== undefined) {
        if (!isRecord(value.engineMs) || Object.keys(value.engineMs).length > 64)
            return false;
        if (!Object.entries(value.engineMs).every(([engineId, duration]) => isBoundedString(engineId, 128, false) && isNonNegativeNumber(duration)))
            return false;
    }
    if (value.controlledMemory !== undefined) {
        if (!isRecord(value.controlledMemory))
            return false;
        const memoryKeys = [
            "currentControlledBytes",
            "peakControlledBytes",
            "retainedArtifactBytes",
            "retainedCacheBytes",
            "transientScratchBytes",
        ];
        if (!memoryKeys.every((key) => isNonNegativeInteger(value.controlledMemory[key])))
            return false;
    }
    return true;
}
function isStructuredPayload(value) {
    if (value === null)
        return true;
    if (!isRecord(value)
        || !isBoundedString(value.kind, 64, false)
        || value.parserVersion !== "1.0"
        || !isRecord(value.fields)
        || Object.keys(value.fields).length > 128
        || !isBoundedStringArray(value.warnings, 64, 2_048))
        return false;
    return Object.values(value.fields).every((field) => {
        if (field === null || typeof field === "number" || typeof field === "boolean")
            return true;
        if (isBoundedString(field, 65_536))
            return true;
        return isBoundedStringArray(field, 256, 65_536);
    });
}
function isScanResult(value) {
    if (!isRecord(value)
        || !BARCODE_FORMATS.has(value.format)
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
        || !isScanTiming(value.timing))
        return false;
    if (value.formatClass !== undefined && !BARCODE_FORMAT_CLASSES.has(value.formatClass))
        return false;
    if (value.rawBytes !== undefined && (!(value.rawBytes instanceof Uint8Array) || value.rawBytes.byteLength > 64 * 1024 * 1024))
        return false;
    if (value.cornerPoints !== undefined && (!Array.isArray(value.cornerPoints)
        || value.cornerPoints.length > 64
        || !value.cornerPoints.every((point) => isRecord(point) && typeof point.x === "number" && Number.isFinite(point.x) && typeof point.y === "number" && Number.isFinite(point.y))))
        return false;
    if (value.orientation !== undefined && (typeof value.orientation !== "number" || !Number.isFinite(value.orientation)))
        return false;
    if (value.symbologyIdentifier !== undefined && !isBoundedString(value.symbologyIdentifier, 128))
        return false;
    if (value.isGs1 !== undefined && typeof value.isGs1 !== "boolean")
        return false;
    if (value.metadata !== undefined && !isRecord(value.metadata))
        return false;
    return true;
}
function isSdkError(value) {
    if (!isRecord(value)
        || !SDK_ERROR_CODE_VALUES.has(value.code)
        || !SDK_ERROR_CATEGORIES.has(value.category)
        || !isBoundedString(value.message, 2_048, false)
        || typeof value.retryable !== "boolean")
        return false;
    if (value.details === undefined)
        return true;
    return isRecord(value.details)
        && Object.keys(value.details).length <= 64
        && Object.values(value.details).every((detail) => detail === null
            || typeof detail === "boolean"
            || (typeof detail === "number" && Number.isFinite(detail))
            || isBoundedString(detail, 65_536));
}
function isScanOutcome(value) {
    if (!isRecord(value)
        || typeof value.ok !== "boolean"
        || !isBoundedString(value.frameId, 128, false)
        || !isBoundedString(value.scenarioId, 64, false)
        || !isNonNegativeInteger(value.attemptCount)
        || !isScanTiming(value.timing))
        return false;
    if (!value.ok)
        return isSdkError(value.error);
    if (!Array.isArray(value.results) || value.results.length === 0 || value.results.length > 64)
        return false;
    if (!value.results.every((result) => isScanResult(result) && result.frameId === value.frameId))
        return false;
    const primary = value.primary;
    if (!isScanResult(primary) || primary.frameId !== value.frameId)
        return false;
    return value.results.some((result) => result.format === primary.format
        && result.rawText === primary.rawText
        && result.frameId === primary.frameId);
}
export function isWorkerRequest(value) {
    if (!objectWithJobId(value) || (value.type !== "scan" && value.type !== "cancel"))
        return false;
    if (!Number.isSafeInteger(value.generation) || value.generation < 0)
        return false;
    if (value.type === "cancel")
        return true;
    if (typeof value.progress !== "boolean" || !value.frame || typeof value.frame !== "object" || !value.frame.buffer || !(value.frame.buffer instanceof ArrayBuffer))
        return false;
    const frame = fromTransferableFrame(value.frame);
    if (validateFrame(frame).length)
        return false;
    return validateScenario(value.scenario).ok && isWorkerRecoveryRequest(value.recovery);
}
function isWorkerRecoveryRequest(value) {
    if (value === undefined)
        return true;
    if (!isRecord(value) || !RECOVERY_PROFILES.has(value.profile) || !["camera", "static"].includes(value.sourceMode) || typeof value.dpmExperimental !== "boolean")
        return false;
    if (value.excludedRoutes !== undefined && (!Array.isArray(value.excludedRoutes) || value.excludedRoutes.length > 12 || !value.excludedRoutes.every((route) => RECOVERY_ROUTES.has(route))))
        return false;
    if (value.budget !== undefined) {
        if (!isRecord(value.budget))
            return false;
        try {
            validateBudget(value.budget);
        }
        catch {
            return false;
        }
    }
    return true;
}
export function isWorkerResponse(value) {
    try {
        if (!objectWithJobId(value) || typeof value.type !== "string")
            return false;
        if (!isNonNegativeInteger(value.generation))
            return false;
        if (value.type === "stage")
            return isBoundedString(value.stage, 256);
        if (value.type === "progress")
            return isNonNegativeInteger(value.attemptCount);
        if (value.type === "cancelled")
            return isNonNegativeNumber(value.elapsedMs);
        if (value.type === "error")
            return isBoundedString(value.message, 2_048, false);
        if (value.type !== "result" || !isScanOutcome(value.outcome))
            return false;
        return (value.wasmMemory === undefined || isWorkerWasmMemoryObservation(value.wasmMemory))
            && (value.recovery === undefined || isWorkerRecoveryObservation(value.recovery));
    }
    catch {
        // Worker messages cross an untrusted realm boundary. Validation must never
        // let malformed data escape as an exception into the session lifecycle.
        return false;
    }
}
function isWorkerRecoveryObservation(value) {
    if (!isRecord(value) || typeof value.insufficientEvidence !== "boolean")
        return false;
    if (!["attemptCount", "processedPixels", "currentTemporaryBytes", "peakTemporaryBytes", "activeBuffers", "routeStateCount"].every((key) => isNonNegativeInteger(value[key])))
        return false;
    if (!Array.isArray(value.attemptedRoutes) || value.attemptedRoutes.length > 12 || !value.attemptedRoutes.every((route) => RECOVERY_ROUTES.has(route)))
        return false;
    return value.successfulRoute === undefined || RECOVERY_ROUTES.has(value.successfulRoute);
}
function isWorkerWasmMemoryObservation(value) {
    if (!value || typeof value !== "object")
        return false;
    const observation = value;
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
//# sourceMappingURL=worker-messages.js.map