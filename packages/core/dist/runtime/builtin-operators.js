import { parseSemanticPayload } from "@scanly/parsers";
import { sdkError } from "../contracts/errors.js";
import { bytesPerPixel, createRgbaFrame } from "../contracts/frame.js";
import { dedupeCandidates } from "../qr/candidate-dedupe.js";
import { generateCandidates } from "../qr/candidate-generation.js";
import { decodePixelBuffer } from "../qr/decode-pipeline.js";
import { dedupeResults } from "../qr/result-normalizer.js";
import { DEFAULT_PIPELINE_CONFIG } from "../qr/types.js";
import { cropBuffer } from "../qr/region-detection.js";
import { OperatorRegistry } from "./operator-registry.js";
import { scenarioToPipelineConfig } from "./scenario-runtime.js";
import { createCoordinateTransform, IDENTITY_MATRIX } from "../qr/geometry.js";
import { monotonicNow } from "./execution-budget.js";
export const BUILTIN_OPERATOR_IDS = [
    "scanly.frame-normalization",
    "scanly.roi",
    "scanly.localization",
    "scanly.candidate-generation",
    "scanly.candidate-deduplication",
    "scanly.enhancement-plan",
    "scanly.geometry",
    "scanly.decoder-execution",
    "scanly.result-aggregation",
    "scanly.validation",
    "scanly.semantic-parsing",
];
const MAX_DECODED_TEXT_LENGTH = 65_536;
const MAX_WARNING_COUNT = 32;
const MAX_MESSAGE_LENGTH = 512;
function descriptor(id, accepts, produces, cpu = "low") {
    return {
        id,
        version: "2.0.0-alpha.2",
        accepts,
        produces,
        configurationSchemaId: "https://scanly.dev/schema/scenario/2.1",
        cost: { cpu },
        cancellation: "cooperative",
        behavior: "deterministic",
        threadSafety: "thread-safe",
    };
}
function read(context, key) {
    const value = context.artifacts.get(key);
    if (value === undefined)
        throw Object.assign(new Error(`Required graph artifact '${key}' is missing.`), { code: "internal_invariant_failure" });
    return value;
}
function rgbaFromFrame(frame) {
    const bpp = bytesPerPixel(frame.pixelFormat);
    if (frame.pixelFormat === "yuv420" || bpp === null) {
        throw Object.assign(new Error("YUV420 input is unsupported until a YUV normalization operator is registered."), { code: "unsupported_format" });
    }
    if (frame.pixelFormat === "rgba8888" && frame.rowStride === frame.width * 4) {
        return {
            data: frame.data instanceof Uint8ClampedArray ? frame.data : new Uint8ClampedArray(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength),
            width: frame.width,
            height: frame.height,
        };
    }
    const output = new Uint8ClampedArray(frame.width * frame.height * 4);
    for (let y = 0; y < frame.height; y++) {
        const row = y * frame.rowStride;
        for (let x = 0; x < frame.width; x++) {
            const source = row + x * bpp;
            const target = (y * frame.width + x) * 4;
            if (frame.pixelFormat === "gray8")
                output[target] = output[target + 1] = output[target + 2] = frame.data[source];
            else {
                output[target] = frame.data[source];
                output[target + 1] = frame.data[source + 1];
                output[target + 2] = frame.data[source + 2];
            }
            output[target + 3] = frame.pixelFormat === "rgba8888" ? frame.data[source + 3] : 255;
        }
    }
    return { data: output, width: frame.width, height: frame.height };
}
function roi(buffer, scenario) {
    const value = scenario.input.roi;
    if (value.mode === "full-frame")
        return { buffer, transform: createCoordinateTransform(IDENTITY_MATRIX, buffer.width, buffer.height, buffer.width, buffer.height) };
    const x = Math.floor((value.x ?? 0) * buffer.width);
    const y = Math.floor((value.y ?? 0) * buffer.height);
    const width = Math.min(Math.max(1, Math.floor((value.width ?? 1) * buffer.width)), buffer.width - x);
    const height = Math.min(Math.max(1, Math.floor((value.height ?? 1) * buffer.height)), buffer.height - y);
    return {
        buffer: cropBuffer(buffer, { x, y, width, height }),
        transform: createCoordinateTransform([1, 0, x, 0, 1, y, 0, 0, 1], width, height, buffer.width, buffer.height),
    };
}
class FrameNormalizationOperator {
    descriptor = descriptor(BUILTIN_OPERATOR_IDS[0], ["frame.normalized"], ["pixel-buffer.rgba8888"], "medium");
    async execute(_input, _configuration, context) {
        const frame = read(context, "input.frame");
        const buffer = rgbaFromFrame(frame);
        context.artifacts.set("frame.rgba", buffer, buffer.data === frame.data ? 0 : buffer.data.byteLength);
        context.trace("operator.frame-normalization");
    }
}
class RoiOperator {
    descriptor = descriptor(BUILTIN_OPERATOR_IDS[1], ["pixel-buffer.rgba8888"], ["pixel-buffer.roi", "frame.roi-transform"], "medium");
    async execute(_input, configuration, context) {
        const source = read(context, "frame.rgba");
        const output = roi(source, configuration.scenario);
        context.artifacts.set("frame.roi", output.buffer, output.buffer === source ? 0 : output.buffer.data.byteLength);
        context.artifacts.set("frame.roi-transform", output.transform);
        context.trace("operator.roi", configuration.scenario.input.roi.mode);
    }
}
class LocalizationOperator {
    descriptor = descriptor(BUILTIN_OPERATOR_IDS[2], ["pixel-buffer.roi"], ["localization.plan"]);
    async execute(_input, configuration, context) {
        const config = { ...DEFAULT_PIPELINE_CONFIG, ...scenarioToPipelineConfig(configuration.scenario) };
        context.artifacts.set("localization.plan", config);
        context.trace("operator.localization", config.enableLocalization ? configuration.scenario.localization.strategy : "disabled");
    }
}
class CandidateGenerationOperator {
    descriptor = descriptor(BUILTIN_OPERATOR_IDS[3], ["pixel-buffer.roi", "frame.roi-transform", "localization.plan"], ["candidates.raw"], "high");
    async execute(_input, _configuration, context) {
        const frame = read(context, "frame.roi");
        const config = read(context, "localization.plan");
        const sourceToFrame = read(context, "frame.roi-transform");
        const candidates = generateCandidates(frame, {
            previewSize: config.previewSize,
            maxCandidates: config.maxCandidates,
            paddings: config.paddings,
            scales: config.scales,
            maxPixels: config.maxPixels,
            enableLocalization: config.enableLocalization,
            enableFullImageFallback: config.enableFullImageFallback,
            enableSplitImageFallback: config.enableSplitImageFallback,
            budget: context.budget,
            sourceToFrame,
        });
        const retainedBytes = candidates.reduce((sum, candidate) => sum + candidate.buffer.data.byteLength, 0);
        context.artifacts.set("candidates.raw", candidates, retainedBytes);
        context.trace("operator.candidate-generation", String(candidates.length));
    }
}
class CandidateDeduplicationOperator {
    descriptor = descriptor(BUILTIN_OPERATOR_IDS[4], ["candidates.raw"], ["candidates.unique"]);
    async execute(_input, _configuration, context) {
        const unique = dedupeCandidates(read(context, "candidates.raw"));
        context.artifacts.set("candidates.unique", unique);
        context.trace("operator.candidate-deduplication", String(unique.length));
    }
}
class EnhancementPlanOperator {
    descriptor = descriptor(BUILTIN_OPERATOR_IDS[5], ["localization.plan"], ["enhancement.plan"]);
    async execute(_input, _configuration, context) {
        const config = read(context, "localization.plan");
        context.artifacts.set("enhancement.plan", config);
        context.trace("operator.enhancement-plan", config.preprocessOrder.join(","));
    }
}
class GeometryOperator {
    descriptor = descriptor(BUILTIN_OPERATOR_IDS[6], ["candidates.unique", "enhancement.plan"], ["geometry.plan"]);
    async execute(_input, _configuration, context) {
        const config = read(context, "enhancement.plan");
        context.artifacts.set("geometry.plan", { rotations: config.rotations });
        context.trace("operator.geometry", config.rotations.join(","));
    }
}
function engineExecutor(registry, scenario) {
    const versions = Object.fromEntries(registry.list().map((engine) => [engine.id, engine.version]));
    return {
        engineIds: scenario.decoders.order,
        versions,
        decode: (engineId, image, options) => registry.decode(engineId, createRgbaFrame(image.data, image.width, image.height, { id: `attempt-${engineId}`, sourceType: "pixel-buffer", ownership: "borrowed" }), { formats: scenario.acceptedFormats, findMultiple: options.findMultiple, signal: options.signal, inversion: options.inversion }),
    };
}
function mergeParallel(outcomes, started, deduplication) {
    const attempts = outcomes.flatMap((outcome) => outcome.attempts);
    const successes = outcomes.filter((outcome) => outcome.ok);
    const phaseTiming = { candidateGenerationMs: 0, preprocessMs: 0, rotationMs: 0, engineMs: {} };
    for (const outcome of outcomes) {
        const phase = outcome.phaseTiming;
        if (!phase)
            continue;
        phaseTiming.preprocessMs += phase.preprocessMs;
        phaseTiming.rotationMs += phase.rotationMs;
        for (const [id, elapsed] of Object.entries(phase.engineMs ?? {}))
            phaseTiming.engineMs[id] = (phaseTiming.engineMs[id] ?? 0) + elapsed;
    }
    if (successes.length) {
        const results = dedupeResults(successes.flatMap((outcome) => outcome.results), deduplication);
        const nonEmpty = results;
        return {
            ok: true,
            results: nonEmpty,
            primary: nonEmpty[0],
            attempts,
            attemptCount: attempts.length,
            elapsedMs: monotonicNow() - started,
            timeToFirstResultMs: Math.min(...successes.map((outcome) => outcome.timeToFirstResultMs ?? outcome.elapsedMs)),
            cancelled: false,
            phaseTiming,
        };
    }
    const representative = outcomes.find((outcome) => !outcome.ok && outcome.reason !== "no_qr_found") ?? outcomes[0];
    return { ...representative, attempts, attemptCount: attempts.length, elapsedMs: monotonicNow() - started, phaseTiming };
}
class DecoderExecutionOperator {
    descriptor = descriptor(BUILTIN_OPERATOR_IDS[7], ["candidates.unique", "geometry.plan"], ["decode.outcome"], "high");
    async execute(_input, configuration, context) {
        const frame = read(context, "frame.roi");
        const candidates = read(context, "candidates.unique");
        const base = read(context, "enhancement.plan");
        const executor = engineExecutor(configuration.engines, configuration.scenario);
        const started = monotonicNow();
        let outcome;
        if (configuration.scenario.decoders.execution === "parallel" && base.decoders.order.length > 1) {
            const branchBudget = Math.max(1, Math.floor(base.maxAttempts / base.decoders.order.length));
            const controllers = base.decoders.order.map(() => new AbortController());
            const abortAll = () => controllers.forEach((controller) => controller.abort());
            context.signal?.addEventListener("abort", abortAll, { once: true });
            if (context.signal?.aborted)
                abortAll();
            try {
                const branches = base.decoders.order.map((id, index) => decodePixelBuffer(frame, {
                    signal: controllers[index].signal,
                    candidates,
                    engineExecutor: executor,
                    executionBudget: context.budget,
                    memoryBudget: context.artifacts.memoryBudget,
                    config: { ...base, maxAttempts: branchBudget, decoders: { order: [id], execution: "sequential" } },
                }).then((result) => {
                    // Preserve declared priority: a single-code success can only make
                    // lower-priority branches redundant. Multi-code branches all finish.
                    if (result.ok && !configuration.scenario.multiCode.enabled) {
                        controllers.slice(index + 1).forEach((controller) => controller.abort());
                    }
                    return result;
                }));
                outcome = mergeParallel(await Promise.all(branches), started, base.resultDeduplication);
            }
            finally {
                context.signal?.removeEventListener("abort", abortAll);
            }
        }
        else {
            outcome = await decodePixelBuffer(frame, { signal: context.signal, candidates, engineExecutor: executor, config: base, executionBudget: context.budget, memoryBudget: context.artifacts.memoryBudget });
        }
        context.artifacts.set("decode.outcome", outcome);
        context.trace("operator.decoder-execution", `${base.decoders.execution}:${outcome.attemptCount}`);
    }
}
function timing(outcome) {
    const phase = outcome.phaseTiming;
    return {
        totalMs: outcome.elapsedMs,
        ...(outcome.ok && outcome.timeToFirstResultMs !== undefined ? { timeToFirstResultMs: outcome.timeToFirstResultMs } : {}),
        candidateGenerationMs: phase?.candidateGenerationMs,
        preprocessingMs: phase?.preprocessMs,
        rotationMs: phase?.rotationMs,
        decodingMs: phase ? Object.values(phase.engineMs ?? {}).reduce((sum, value) => sum + value, 0) : undefined,
        engineMs: phase?.engineMs,
        workerSetupMs: phase?.workerSetupMs,
        workerTransferMs: phase?.workerTransferMs,
    };
}
function failure(frameId, scenarioId, code, message, outcome) {
    return { ok: false, error: sdkError(code, message), frameId, scenarioId, attemptCount: outcome.attemptCount, timing: timing(outcome) };
}
function failureCode(outcome) {
    if (outcome.reason === "no_qr_found")
        return "no_symbol_found";
    if (outcome.reason === "timeout")
        return "timeout";
    if (outcome.reason === "cancelled")
        return "cancelled";
    if (outcome.reason === "invalid_configuration")
        return "invalid_configuration";
    if (outcome.reason === "image_too_large")
        return "resource_limit_exceeded";
    if (["empty_image", "invalid_image", "unsupported_image", "invalid_file"].includes(outcome.reason))
        return "invalid_image";
    return "engine_execution_failure";
}
class ResultAggregationOperator {
    descriptor = descriptor(BUILTIN_OPERATOR_IDS[8], ["decode.outcome"], ["scan.outcome"]);
    async execute(_input, configuration, context) {
        const frame = read(context, "input.frame");
        const outcome = read(context, "decode.outcome");
        if (!outcome.ok) {
            context.artifacts.set("scan.outcome", failure(frame.id, configuration.scenario.id, failureCode(outcome), outcome.message, outcome));
            return;
        }
        if (!outcome.results.length) {
            context.artifacts.set("scan.outcome", failure(frame.id, configuration.scenario.id, "internal_invariant_failure", "Decoder aggregation produced an empty success.", outcome));
            return;
        }
        if (outcome.results.some((code) => code.payload.length > MAX_DECODED_TEXT_LENGTH)) {
            context.artifacts.set("scan.outcome", failure(frame.id, configuration.scenario.id, "resource_limit_exceeded", `Decoded text exceeds the ${MAX_DECODED_TEXT_LENGTH}-character output limit.`, outcome));
            return;
        }
        const resultTiming = timing(outcome);
        const results = outcome.results.slice(0, configuration.scenario.multiCode.maxResults).map((code) => ({
            format: code.format ?? "qr_code",
            rawText: code.payload,
            ...(configuration.scenario.output.includeRawBytes && code.rawBytes ? { rawBytes: code.rawBytes } : {}),
            ...(code.cornerPoints ? { cornerPoints: code.cornerPoints } : {}),
            ...(code.symbolOrientation !== undefined ? { orientation: code.symbolOrientation } : {}),
            engine: { id: code.decoder, version: code.engineVersion ?? "unknown" },
            preprocessingPath: [code.preprocessing],
            candidate: { index: code.candidateIndex, padding: code.cropPadding, scale: code.scale, rotation: code.rotation },
            frameId: frame.id,
            structuredPayload: null,
            ...(code.symbologyIdentifier ? { symbologyIdentifier: code.symbologyIdentifier } : {}),
            validation: { valid: true, validatorIds: [], messages: [] },
            warnings: [],
            timing: resultTiming,
        }));
        const nonEmpty = results;
        const publicAttempts = configuration.scenario.output.includeAttempts ? outcome.attempts.slice(0, configuration.scenario.budgets.maxAttempts).map((attempt, index) => ({
            index,
            engineId: attempt.decoder,
            candidateIndex: attempt.candidateIndex,
            preprocessing: attempt.preprocessing,
            rotation: attempt.rotation,
            elapsedMs: attempt.elapsedMs,
            success: attempt.success,
        })) : undefined;
        context.artifacts.set("scan.outcome", {
            ok: true,
            results: nonEmpty,
            primary: nonEmpty[0],
            frameId: frame.id,
            scenarioId: configuration.scenario.id,
            attemptCount: outcome.attemptCount,
            timing: resultTiming,
            ...(publicAttempts ? { attempts: publicAttempts } : {}),
        });
        context.trace("operator.result-aggregation", String(results.length));
    }
}
function boundedMessages(messages) {
    return messages.slice(0, MAX_WARNING_COUNT).map((message) => message.slice(0, MAX_MESSAGE_LENGTH));
}
class ValidationOperator {
    descriptor = descriptor(BUILTIN_OPERATOR_IDS[9], ["scan.outcome"], ["scan.validated"]);
    async execute(_input, configuration, context) {
        const outcome = read(context, "scan.outcome");
        if (!outcome.ok) {
            context.artifacts.set("scan.validated", outcome);
            return;
        }
        const results = [];
        for (const source of outcome.results) {
            const validatorIds = [];
            const messages = [];
            let valid = true;
            const warnings = [...source.warnings];
            for (const requested of configuration.scenario.validation) {
                const validator = configuration.validators.get(requested.id);
                if (!validator) {
                    if (!requested.required)
                        warnings.push(`Optional validator '${requested.id}' is not registered.`);
                    continue;
                }
                validatorIds.push(validator.id);
                const result = await validator.validate(source, { signal: context.signal, frameId: source.frameId, scenarioId: configuration.scenario.id });
                valid &&= result.valid;
                messages.push(...(result.messages ?? []));
            }
            results.push({ ...source, validation: { valid, validatorIds, messages: boundedMessages(messages) }, warnings: boundedMessages(warnings) });
        }
        const nonEmpty = results;
        const validated = { ...outcome, results: nonEmpty, primary: nonEmpty[0] };
        context.artifacts.set("scan.validated", validated);
        context.trace("operator.validation");
    }
}
function parserEnabled(structured, enabled) {
    if (!structured)
        return null;
    const ids = {
        url: "url", wifi: "wifi", vcard: "vcard", email: "email", telephone: "telephone", sms: "sms", geo: "geo",
        calendar: "calendar", "gs1-element-string": "gs1", "gs1-digital-link": "gs1-digital-link",
    };
    return enabled.includes(ids[structured.kind]) ? structured : null;
}
class SemanticParsingOperator {
    descriptor = descriptor(BUILTIN_OPERATOR_IDS[10], ["scan.validated"], ["scan.final"]);
    async execute(_input, configuration, context) {
        const outcome = read(context, "scan.validated");
        if (!outcome.ok) {
            context.artifacts.set("scan.final", outcome);
            return;
        }
        const results = outcome.results.map((source) => {
            const semantic = parseSemanticPayload(source.rawText);
            return { ...source, structuredPayload: parserEnabled(semantic.structured, configuration.scenario.semanticParsers), warnings: boundedMessages([...source.warnings, ...(semantic.structured?.warnings ?? [])]) };
        });
        context.artifacts.set("scan.final", { ...outcome, results, primary: results[0] });
        context.trace("operator.semantic-parsing");
    }
}
export function createDefaultOperatorRegistry() {
    const registry = new OperatorRegistry();
    registry.register(new FrameNormalizationOperator());
    registry.register(new RoiOperator());
    registry.register(new LocalizationOperator());
    registry.register(new CandidateGenerationOperator());
    registry.register(new CandidateDeduplicationOperator());
    registry.register(new EnhancementPlanOperator());
    registry.register(new GeometryOperator());
    registry.register(new DecoderExecutionOperator());
    registry.register(new ResultAggregationOperator());
    registry.register(new ValidationOperator());
    registry.register(new SemanticParsingOperator());
    return registry;
}
//# sourceMappingURL=builtin-operators.js.map