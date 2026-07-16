import { DEFAULT_PIPELINE_CONFIG, validatePipelineConfig } from "./types.js";
import { dedupeCandidates } from "./candidate-dedupe.js";
import { generateCandidates } from "./candidate-generation.js";
import { applyPreprocess } from "./preprocess.js";
import { rotateBuffer } from "./rotate.js";
import { dedupeResults, normalizePayload } from "./result-normalizer.js";
function mergeConfig(partial) {
    return { ...DEFAULT_PIPELINE_CONFIG, ...partial };
}
function throwIfAborted(signal) {
    if (signal?.aborted) {
        const err = new Error("cancelled");
        err.name = "AbortError";
        throw err;
    }
}
function timedOut(start, timeoutMs) {
    return Date.now() - start >= timeoutMs;
}
/** Yield to the event loop so AbortSignal and UI can run between attempts. */
async function cooperativeYield(signal) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    throwIfAborted(signal);
}
function decoderEnabled(config, name) {
    return config.decoders?.order.includes(name) ?? false;
}
function allRequiredFound(payloads, required) {
    if (!required?.length)
        return false;
    return required.every((p) => payloads.includes(p));
}
export function buildAttemptPlan(preprocessOrder, rotations, budgetRemaining) {
    const plan = [];
    for (const preprocessing of preprocessOrder) {
        plan.push({ preprocessing, rotation: 0 });
    }
    const rotatedPreprocess = ["original", "contrast", "invert", "otsu"];
    for (const rotation of rotations) {
        if (rotation === 0)
            continue;
        for (const preprocessing of rotatedPreprocess) {
            plan.push({ preprocessing, rotation });
        }
    }
    return plan.slice(0, Math.max(0, budgetRemaining));
}
class AttemptImageCache {
    maxEntries;
    maxBytes;
    entries = new Map();
    ids = new WeakMap();
    sequence = 0;
    retainedBytes = 0;
    constructor(maxEntries, maxBytes) {
        this.maxEntries = maxEntries;
        this.maxBytes = maxBytes;
    }
    key(buffer, preprocessing, rotation) {
        let id = this.ids.get(buffer);
        if (id === undefined) {
            id = ++this.sequence;
            this.ids.set(buffer, id);
        }
        return `${id}:${preprocessing}:${rotation}`;
    }
    getOrCreate(key, create) {
        const existing = this.entries.get(key);
        if (existing)
            return existing;
        const value = create();
        const bytes = value.data.byteLength;
        if (this.entries.size < this.maxEntries && this.retainedBytes + bytes <= this.maxBytes) {
            this.entries.set(key, value);
            this.retainedBytes += bytes;
        }
        return value;
    }
}
function processedFor(ctx, candidate, preprocessing, rotation) {
    const key = ctx.intermediateCache.key(candidate.buffer, preprocessing, rotation);
    return ctx.intermediateCache.getOrCreate(key, () => {
        const preprocessStarted = Date.now();
        let processed = applyPreprocess(candidate.buffer, preprocessing);
        ctx.phaseTiming.preprocessMs += Date.now() - preprocessStarted;
        if (rotation !== 0) {
            const rotationStarted = Date.now();
            processed = rotateBuffer(processed, rotation);
            ctx.phaseTiming.rotationMs += Date.now() - rotationStarted;
        }
        return processed;
    });
}
function shouldStopMultiple(ctx) {
    const payloads = ctx.found.map((r) => r.payload);
    const { config } = ctx;
    // A stall can end collection only after at least one real decode.
    if (payloads.length === 0)
        return false;
    if (config.requiredPayloads?.length) {
        // Known completeness contracts must not stop on a heuristic stall.
        return allRequiredFound(payloads, config.requiredPayloads);
    }
    if (config.expectedResultCount && payloads.length >= config.expectedResultCount) {
        return true;
    }
    if (!config.findMultiple)
        return false;
    if (payloads.length >= config.maxMultipleResults)
        return true;
    if (payloads.length >= 3)
        return true;
    const stall = config.stallCandidateLimit ?? 8;
    if (payloads.length === 2 && ctx.candidatesSinceNew >= stall + 3)
        return true;
    if (payloads.length === 1 && ctx.candidatesSinceNew >= stall)
        return true;
    return false;
}
function pushResult(ctx, code) {
    const prevSize = ctx.found.length;
    ctx.found.push(code);
    const unique = dedupeResults(ctx.found);
    unique.sort((a, b) => a.candidateIndex - b.candidateIndex);
    ctx.found.length = 0;
    ctx.found.push(...unique);
    if (unique.length > prevSize) {
        ctx.candidatesSinceNew = 0;
    }
    if (!ctx.config.findMultiple) {
        return successOutcome(unique, ctx.attempts, ctx.start, false, ctx.phaseTiming);
    }
    if (shouldStopMultiple(ctx)) {
        return successOutcome(unique, ctx.attempts, ctx.start, false, ctx.phaseTiming);
    }
    return null;
}
function onCandidateDone(ctx, hadNewResult) {
    if (!hadNewResult)
        ctx.candidatesSinceNew += 1;
}
async function tryEngine(ctx, engineId, candidate, preprocessing, rotation) {
    throwIfAborted(ctx.signal);
    if (timedOut(ctx.start, ctx.config.timeoutMs))
        return null;
    if (ctx.attempts.length >= ctx.config.maxAttempts)
        return null;
    if (!decoderEnabled(ctx.config, engineId))
        return null;
    const t0 = Date.now();
    const processed = processedFor(ctx, candidate, preprocessing, rotation);
    const t1 = Date.now();
    const decoded = await ctx.engineExecutor.decode(engineId, processed, { signal: ctx.signal, findMultiple: ctx.config.findMultiple });
    const engineElapsed = Date.now() - t1;
    const engineTiming = (ctx.phaseTiming.engineMs ??= {});
    engineTiming[engineId] = (engineTiming[engineId] ?? 0) + engineElapsed;
    ctx.attempts.push({
        candidateIndex: candidate.candidateIndex,
        candidateScore: candidate.candidateScore,
        cropPadding: candidate.cropPadding,
        preprocessing,
        scale: candidate.scale,
        scaleFactor: candidate.scaleFactor,
        rotation,
        decoder: engineId,
        elapsedMs: Date.now() - t0,
        success: decoded.ok && decoded.results.length > 0,
    });
    ctx.onProgress?.({ attemptCount: ctx.attempts.length });
    if (!decoded.ok)
        return null;
    let completed = null;
    for (const result of decoded.results) {
        const payload = normalizePayload(result.text);
        if (!payload)
            continue;
        completed = pushResult(ctx, {
            payload,
            format: result.format,
            rawBytes: result.rawBytes,
            decoder: engineId,
            engineVersion: ctx.engineExecutor.versions?.[engineId],
            cornerPoints: result.cornerPoints,
            symbologyIdentifier: result.symbologyIdentifier,
            preprocessing,
            candidateIndex: candidate.candidateIndex,
            scale: candidate.scale,
            rotation,
            cropPadding: candidate.cropPadding,
            attemptIndex: ctx.attempts.length - 1,
            foundAtMs: Date.now() - ctx.start,
        }) ?? completed;
    }
    return completed;
}
export function orderCandidates(candidates, findMultiple) {
    const earlyFull = candidates.filter((c) => c.cropPadding === "full");
    const splits = candidates.filter((c) => c.candidateIndex >= 100);
    const crops = candidates.filter((c) => c.cropPadding !== "full" && c.candidateIndex < 100);
    return findMultiple
        ? [...crops.slice(0, 2), ...splits, ...earlyFull.slice(0, 1), ...crops.slice(2), ...earlyFull.slice(1)]
        : [...crops.slice(0, 3), ...earlyFull.slice(0, 1), ...crops.slice(3), ...earlyFull.slice(1)];
}
/**
 * Breadth-first decode pipeline with dedupe, adaptive multiple stop, and fail-fast.
 */
export async function decodePixelBuffer(image, options = {}) {
    const config = mergeConfig(options.config);
    const start = Date.now();
    const attempts = [];
    const found = [];
    const signal = options.signal;
    const engineExecutor = options.engineExecutor;
    const phaseTiming = {
        candidateGenerationMs: 0,
        jsqrMs: 0,
        zxingMs: 0,
        preprocessMs: 0,
        rotationMs: 0,
    };
    const fail = (reason, message, cancelled = false) => ({
        ok: false,
        reason,
        message,
        attempts,
        attemptCount: attempts.length,
        elapsedMs: Date.now() - start,
        cancelled,
        phaseTiming,
    });
    const ctx = {
        config,
        signal,
        start,
        attempts,
        found,
        onStage: options.onStage,
        onProgress: options.onProgress,
        phaseTiming,
        candidatesSinceNew: 0,
        failFast: false,
        intermediateCache: new AttemptImageCache(config.maxIntermediateAllocations ?? 24, config.maxIntermediateBytes ?? 64 * 1024 * 1024),
        engineExecutor: engineExecutor,
    };
    try {
        throwIfAborted(signal);
        const configurationIssues = validatePipelineConfig(config);
        if (!engineExecutor)
            configurationIssues.push("engineExecutor is required; register decoder plugins and execute through CaptureRouter.");
        if (engineExecutor && config.decoders.order.some((id) => !engineExecutor.engineIds.includes(id))) {
            configurationIssues.push("decoder order contains an engine that is not available from engineExecutor.");
        }
        if (configurationIssues.length) {
            return fail("invalid_configuration", configurationIssues.join(" "));
        }
        if (image.width < 1 || image.height < 1 || image.data.length === 0) {
            return fail("empty_image", "Image has no pixel data.");
        }
        if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.data.length < image.width * image.height * 4) {
            return fail("invalid_image", "Pixel buffer dimensions, stride, or byte length are invalid.");
        }
        if (image.width * image.height > config.maxPixels * 6) {
            return fail("image_too_large", "Pixel buffer exceeds the direct-input safety limit for this scenario.");
        }
        options.onStage?.("Detecting candidate regions…");
        const cgStart = Date.now();
        const rawCandidates = options.candidates ?? generateCandidates(image, {
            previewSize: config.previewSize,
            maxCandidates: config.maxCandidates,
            paddings: config.paddings,
            scales: config.scales,
            maxPixels: config.maxPixels,
            enableLocalization: config.enableLocalization,
            enableFullImageFallback: config.enableFullImageFallback,
            enableSplitImageFallback: config.enableSplitImageFallback,
        });
        const candidates = dedupeCandidates(rawCandidates);
        phaseTiming.candidateGenerationMs = Date.now() - cgStart;
        const ordered = orderCandidates(candidates, config.findMultiple);
        const primaryEngineId = config.decoders.order[0];
        const fallbackEngineIds = config.decoders.order.slice(1);
        const cheap = ["original", "contrast", "invert"];
        const deep = config.preprocessOrder.filter((m) => !cheap.includes(m));
        const cheapTargets = config.findMultiple ? ordered : ordered.slice(0, 12);
        // Phase 1 — cheap pass
        for (const candidate of cheapTargets) {
            await cooperativeYield(signal);
            throwIfAborted(signal);
            if (timedOut(start, config.timeoutMs)) {
                if (signal?.aborted) {
                    if (found.length)
                        return successOutcome(dedupeResults(found), attempts, start, true, phaseTiming);
                    return fail("cancelled", "Decode cancelled.", true);
                }
                if (found.length)
                    return successOutcome(dedupeResults(found), attempts, start, false, phaseTiming);
                return fail("timeout", "Decode timed out. Try cropping closer to the QR code, using a clearer image, or reducing image size.");
            }
            if (shouldStopMultiple(ctx)) {
                return successOutcome(dedupeResults(found), attempts, start, false, phaseTiming);
            }
            options.onStage?.(candidate.cropPadding === "full"
                ? "Trying full image…"
                : `Decoding candidate ${Math.max(0, candidate.candidateIndex) + 1}…`);
            const before = found.length;
            const candidateMethods = config.findMultiple && found.length > 0 ? ["original", "contrast"] : cheap;
            for (const preprocessing of candidateMethods) {
                const hit = await tryEngine(ctx, primaryEngineId, candidate, preprocessing, 0);
                if (hit)
                    return hit;
                if (config.findMultiple && shouldStopMultiple(ctx))
                    break;
            }
            onCandidateDone(ctx, found.length > before);
            if (!config.findMultiple && found.length > 0) {
                return successOutcome(dedupeResults(found), attempts, start, false, phaseTiming);
            }
            if (ctx.failFast)
                continue;
            if (!config.findMultiple && attempts.length >= (config.failFastAfterAttempts ?? 48) && found.length === 0) {
                ctx.failFast = true;
            }
        }
        if (found.length > 0 && shouldStopMultiple(ctx)) {
            return successOutcome(dedupeResults(found), attempts, start, false, phaseTiming);
        }
        // Phase 2 — deep preprocess (skip if fail-fast with no results)
        if (!ctx.failFast || found.length > 0) {
            const eligibleDeepTargets = ordered.filter((c, idx) => c.cropPadding === "full" || idx < 6 || c.scale === "original");
            const deepTargets = [
                ...eligibleDeepTargets.filter((candidate) => candidate.cropPadding === "full"),
                ...eligibleDeepTargets.filter((candidate) => candidate.cropPadding !== "full"),
            ];
            for (const candidate of deepTargets) {
                await cooperativeYield(signal);
                throwIfAborted(signal);
                if (timedOut(start, config.timeoutMs))
                    break;
                if (attempts.length >= config.maxAttempts)
                    break;
                if (shouldStopMultiple(ctx))
                    break;
                const before = found.length;
                for (const preprocessing of deep) {
                    const hit = await tryEngine(ctx, primaryEngineId, candidate, preprocessing, 0);
                    if (hit)
                        return hit;
                }
                onCandidateDone(ctx, found.length > before);
            }
        }
        if (found.length > 0 && shouldStopMultiple(ctx)) {
            return successOutcome(dedupeResults(found), attempts, start, false, phaseTiming);
        }
        // Return to lower-ranked candidates only after high-value deep preprocessing.
        if (!config.findMultiple && found.length === 0) {
            for (const candidate of ordered.slice(cheapTargets.length)) {
                await cooperativeYield(signal);
                throwIfAborted(signal);
                if (timedOut(start, config.timeoutMs) || attempts.length >= config.maxAttempts)
                    break;
                for (const preprocessing of cheap) {
                    const hit = await tryEngine(ctx, primaryEngineId, candidate, preprocessing, 0);
                    if (hit)
                        return hit;
                }
            }
        }
        // Phase 3 — rotations (only if not fail-fast empty)
        if (!ctx.failFast && found.length === 0) {
            const rotateTargets = ordered.filter((c) => c.cropPadding !== "full").slice(0, 3);
            const rotations = config.rotations.filter((r) => r !== 0);
            for (const candidate of rotateTargets) {
                if (attempts.length >= config.maxAttempts)
                    break;
                for (const rotation of rotations) {
                    for (const preprocessing of ["original", "contrast", "invert"]) {
                        const hit = await tryEngine(ctx, primaryEngineId, candidate, preprocessing, rotation);
                        if (hit)
                            return hit;
                    }
                }
            }
        }
        // Phase 4 - registered fallback engines in scenario order.
        if (found.length === 0 && fallbackEngineIds.length) {
            options.onStage?.("Backup decoder...");
            const zxTargets = ordered.filter((c) => c.cropPadding === "full").slice(0, 2);
            if (zxTargets.length === 0) {
                zxTargets.push(...ordered.slice(0, 2));
            }
            for (const engineId of fallbackEngineIds) {
                for (const candidate of zxTargets) {
                    for (const preprocessing of ["original", "contrast", "invert"]) {
                        const hit = await tryEngine(ctx, engineId, candidate, preprocessing, 0);
                        if (hit)
                            return hit;
                    }
                }
            }
        }
        if (found.length > 0) {
            return successOutcome(dedupeResults(found), attempts, start, false, phaseTiming);
        }
        if (timedOut(start, config.timeoutMs)) {
            if (signal?.aborted) {
                return fail("cancelled", "Decode cancelled.", true);
            }
            return fail("timeout", "Decode timed out. Try cropping closer to the QR code, using a clearer image, or reducing image size.");
        }
        return fail("no_qr_found", "Could not decode a QR code. Try a clearer crop, better lighting, or a less damaged image.");
    }
    catch (e) {
        if (e instanceof Error && (e.name === "AbortError" || e.message === "cancelled")) {
            if (found.length > 0) {
                return successOutcome(dedupeResults(found), attempts, start, true, phaseTiming);
            }
            return fail("cancelled", "Decode cancelled.", true);
        }
        throw e;
    }
}
export function successOutcome(results, attempts, start, cancelled, phaseTiming) {
    if (results.length === 0) {
        throw new Error("Decode success invariant violated: results must be non-empty.");
    }
    const nonEmptyResults = results;
    const foundOffsets = nonEmptyResults
        .map((result) => result.foundAtMs)
        .filter((value) => value !== undefined);
    return {
        ok: true,
        results: nonEmptyResults,
        primary: nonEmptyResults[0],
        attempts,
        attemptCount: attempts.length,
        elapsedMs: Date.now() - start,
        ...(foundOffsets.length ? { timeToFirstResultMs: Math.min(...foundOffsets) } : {}),
        cancelled,
        phaseTiming,
    };
}
//# sourceMappingURL=decode-pipeline.js.map