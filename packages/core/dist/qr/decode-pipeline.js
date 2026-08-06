import { DEFAULT_PIPELINE_CONFIG, validatePipelineConfig } from "./types.js";
import { dedupeCandidates } from "./candidate-dedupe.js";
import { generateCandidates } from "./candidate-generation.js";
import { applyPreprocess } from "./preprocess.js";
import { rotateBuffer } from "./rotate.js";
import { dedupeResults, normalizePayload } from "./result-normalizer.js";
import { mapAndClampPoints, multiplyMatrices, rotatedToSourceMatrix } from "./geometry.js";
import { ExecutionBudget, monotonicNow } from "../runtime/execution-budget.js";
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
function timedOut(start, timeoutMs, now) {
    return now() - start >= timeoutMs;
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
const DIAGNOSTIC_STATUS_PRIORITY = {
    "not-found": 0, cancelled: 1, unsupported: 2, timeout: 3, "initialization-failure": 4, "execution-failure": 5, success: 6,
};
function recordDiagnostic(ctx, engineId, status, elapsedMs, resultCount, message, errorCode) {
    let diagnostic = ctx.diagnostics.find((entry) => entry.engineId === engineId);
    if (!diagnostic) {
        if (ctx.diagnostics.length >= 16)
            return;
        diagnostic = { engineId, engineVersion: ctx.engineExecutor.versions?.[engineId] ?? "unknown", status, elapsedMs: 0, attemptCount: 0, resultCount: 0 };
        ctx.diagnostics.push(diagnostic);
    }
    diagnostic.elapsedMs += Math.max(0, elapsedMs);
    diagnostic.attemptCount += 1;
    diagnostic.resultCount += Math.max(0, resultCount);
    if (DIAGNOSTIC_STATUS_PRIORITY[status] >= DIAGNOSTIC_STATUS_PRIORITY[diagnostic.status])
        diagnostic.status = status;
    if (message && status !== "not-found")
        diagnostic.message = message.slice(0, 256);
    if (errorCode)
        diagnostic.errorCode = errorCode.slice(0, 64);
}
class AttemptImageCache {
    maxEntries;
    maxBytes;
    memoryBudget;
    entries = new Map();
    ids = new WeakMap();
    sequence = 0;
    retainedBytes = 0;
    leases = [];
    constructor(maxEntries, maxBytes, memoryBudget) {
        this.maxEntries = maxEntries;
        this.maxBytes = maxBytes;
        this.memoryBudget = memoryBudget;
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
        const sharedCapacity = !this.memoryBudget || this.memoryBudget.remainingBytes >= bytes;
        if (this.entries.size < this.maxEntries && this.retainedBytes + bytes <= this.maxBytes && sharedCapacity) {
            const lease = this.memoryBudget?.reserve(bytes, `preprocess-cache:${key}`, "cache");
            this.entries.set(key, value);
            this.retainedBytes += bytes;
            if (lease)
                this.leases.push(lease);
        }
        return value;
    }
    dispose() {
        for (const lease of this.leases)
            lease.release();
        this.leases.length = 0;
        this.entries.clear();
        this.retainedBytes = 0;
    }
}
function processedFor(ctx, candidate, preprocessing, rotation) {
    const key = ctx.intermediateCache.key(candidate.buffer, preprocessing, rotation);
    return ctx.intermediateCache.getOrCreate(key, () => {
        ctx.budget.throwIfExceeded("preprocessing");
        const preprocessStarted = ctx.now();
        let processed = applyPreprocess(candidate.buffer, preprocessing, ctx.budget);
        ctx.phaseTiming.preprocessMs += ctx.now() - preprocessStarted;
        if (rotation !== 0) {
            const rotationStarted = ctx.now();
            processed = rotateBuffer(processed, rotation, ctx.budget);
            ctx.phaseTiming.rotationMs += ctx.now() - rotationStarted;
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
    if (config.multiCodeStallPolicy) {
        const policy = config.multiCodeStallPolicy;
        const attemptsWithoutNew = ctx.attempts.length - ctx.attemptsAtLastNewResult;
        const coverage = ctx.primaryCandidateCount ? ctx.visitedPrimaryCandidates.size / ctx.primaryCandidateCount : 1;
        const primaryComplete = !policy.requireAllPrimaryCandidatesVisited || ctx.visitedPrimaryCandidates.size >= ctx.primaryCandidateCount;
        if (attemptsWithoutNew >= policy.maximumAttemptsWithoutNewResult && coverage >= policy.minimumCandidateCoverageBeforeStop && primaryComplete)
            return true;
    }
    const stall = config.stallCandidateLimit ?? 8;
    const scaledStall = stall + Math.max(0, payloads.length - 1) * 3;
    if (ctx.candidatesSinceNew >= scaledStall)
        return true;
    return false;
}
function pushResult(ctx, code) {
    const prevSize = ctx.found.length;
    ctx.found.push(code);
    const unique = dedupeResults(ctx.found, ctx.config.resultDeduplication);
    ctx.found.length = 0;
    ctx.found.push(...unique);
    if (unique.length > prevSize) {
        ctx.candidatesSinceNew = 0;
        ctx.attemptsAtLastNewResult = ctx.attempts.length;
    }
    if (!ctx.config.findMultiple) {
        return successOutcome(unique, ctx.attempts, ctx.start, false, ctx.phaseTiming, ctx.diagnostics);
    }
    if (shouldStopMultiple(ctx)) {
        return successOutcome(unique, ctx.attempts, ctx.start, false, ctx.phaseTiming, ctx.diagnostics);
    }
    return null;
}
function onCandidateDone(ctx, hadNewResult) {
    if (!hadNewResult)
        ctx.candidatesSinceNew += 1;
}
async function tryEngine(ctx, engineId, candidate, preprocessing, rotation) {
    throwIfAborted(ctx.signal);
    ctx.budget.throwIfExceeded("decoder-attempt");
    if (timedOut(ctx.start, ctx.config.timeoutMs, ctx.now))
        return null;
    if (ctx.attempts.length >= ctx.config.maxAttempts)
        return null;
    if (!decoderEnabled(ctx.config, engineId))
        return null;
    if (ctx.failedEngineIds.has(engineId))
        return null;
    if (!ctx.budget.tryConsumeAttempt())
        return null;
    if (candidate.candidateIndex >= 0 && candidate.candidateIndex < 100)
        ctx.visitedPrimaryCandidates.add(candidate.candidateIndex);
    const t0 = ctx.now();
    const processed = processedFor(ctx, candidate, preprocessing, rotation);
    const t1 = ctx.now();
    let decoded;
    try {
        decoded = await ctx.engineExecutor.decode(engineId, processed, {
            formats: ctx.config.formats,
            signal: ctx.signal,
            findMultiple: ctx.config.findMultiple,
            inversion: preprocessing === "invert" ? "inverted" : "original",
        });
    }
    catch (error) {
        const nestedCode = error && typeof error === "object" && "error" in error ? String(error.error?.code ?? "") : "";
        const directCode = error && typeof error === "object" && "code" in error ? String(error.code ?? "") : "";
        const code = nestedCode || directCode;
        const status = code.includes("initialization") ? "initialization-failure" : code === "cancelled" ? "cancelled" : "execution-failure";
        recordDiagnostic(ctx, engineId, status, ctx.now() - t1, 0, error instanceof Error ? error.message : String(error));
        if (ctx.config.decoders.failurePolicy === "success-wins" && status !== "cancelled") {
            ctx.failedEngineIds.add(engineId);
            return null;
        }
        throw error;
    }
    const engineElapsed = ctx.now() - t1;
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
        elapsedMs: ctx.now() - t0,
        success: decoded.ok && decoded.results.length > 0,
    });
    ctx.onProgress?.({ attemptCount: ctx.attempts.length });
    if (!decoded.ok) {
        const status = decoded.category === "not-found" ? "not-found" : decoded.category === "unsupported-format" || decoded.category === "invalid-input" ? "unsupported" : decoded.category === "initialization" ? "initialization-failure" : decoded.category === "execution" ? "execution-failure" : decoded.category;
        recordDiagnostic(ctx, engineId, status, engineElapsed, 0, decoded.message, decoded.code);
        if (decoded.category === "not-found")
            return null;
        if (ctx.config.decoders.failurePolicy === "success-wins"
            && (decoded.category === "initialization" || decoded.category === "execution" || decoded.category === "unsupported-format")) {
            ctx.failedEngineIds.add(engineId);
            return null;
        }
        const reasons = {
            "unsupported-format": "unsupported_format",
            "invalid-input": "invalid_image",
            initialization: "engine_initialization_failure",
            execution: "engine_execution_failure",
            cancelled: "cancelled",
            timeout: "timeout",
        };
        const reason = reasons[decoded.category];
        const error = Object.assign(new Error(decoded.message), { code: reason, name: reason === "cancelled" ? "AbortError" : reason === "timeout" ? "TimeoutError" : "EngineError" });
        throw error;
    }
    recordDiagnostic(ctx, engineId, "success", engineElapsed, decoded.results.length);
    let completed = null;
    for (const result of decoded.results) {
        // A plugin must never widen a caller's explicit format selection at the result boundary.
        if (!ctx.config.formats.includes(result.format))
            continue;
        const payload = normalizePayload(result.text);
        if (!payload)
            continue;
        const candidateToFrame = multiplyMatrices(candidate.transform.matrix, rotatedToSourceMatrix(rotation, candidate.buffer.width, candidate.buffer.height));
        const cornerPoints = result.cornerPoints
            ? mapAndClampPoints(result.cornerPoints, candidateToFrame, candidate.transform.targetWidth, candidate.transform.targetHeight)
            : undefined;
        const symbolOrientation = result.orientation === undefined
            ? undefined
            : ((result.orientation - rotation) % 360 + 360) % 360;
        completed = pushResult(ctx, {
            payload,
            format: result.format,
            rawBytes: result.rawBytes,
            decoder: engineId,
            engineVersion: ctx.engineExecutor.versions?.[engineId],
            engineMetadata: result.engineMetadata,
            cornerPoints,
            symbologyIdentifier: result.symbologyIdentifier,
            isGs1: result.isGs1,
            metadata: result.metadata,
            preprocessing,
            candidateIndex: candidate.candidateIndex,
            scale: candidate.scale,
            rotation,
            symbolOrientation,
            cropPadding: candidate.cropPadding,
            attemptIndex: ctx.attempts.length - 1,
            foundAtMs: ctx.now() - ctx.start,
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
    const now = options.executionBudget ? () => options.executionBudget.now() : monotonicNow;
    const start = now();
    const attempts = [];
    const found = [];
    const diagnostics = [];
    const signal = options.signal;
    const engineExecutor = options.engineExecutor;
    const phaseTiming = {
        candidateGenerationMs: 0,
        preprocessMs: 0,
        rotationMs: 0,
    };
    const fail = (reason, message, cancelled = false) => ({
        ok: false,
        reason,
        message,
        attempts,
        attemptCount: attempts.length,
        elapsedMs: now() - start,
        cancelled,
        engineDiagnostics: diagnostics,
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
        attemptsAtLastNewResult: 0,
        visitedPrimaryCandidates: new Set(),
        primaryCandidateCount: 0,
        failFast: false,
        intermediateCache: new AttemptImageCache(config.maxIntermediateAllocations ?? 24, config.maxIntermediateBytes ?? 64 * 1024 * 1024, options.memoryBudget),
        engineExecutor: engineExecutor,
        budget: options.executionBudget ?? new ExecutionBudget({
            signal,
            deadlineMs: start + config.timeoutMs,
            now,
            remainingAttempts: () => config.maxAttempts - attempts.length,
            memory: options.memoryBudget,
        }),
        now,
        diagnostics,
        failedEngineIds: new Set(),
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
        const cgStart = now();
        const rawCandidates = options.candidates ?? generateCandidates(image, {
            previewSize: config.previewSize,
            maxCandidates: config.maxCandidates,
            paddings: config.paddings,
            scales: config.scales,
            maxPixels: config.maxPixels,
            enableLocalization: config.enableLocalization,
            enableFullImageFallback: config.enableFullImageFallback,
            enableSplitImageFallback: config.enableSplitImageFallback,
            enableGridImageFallback: config.enableGridImageFallback,
            budget: ctx.budget,
        });
        const candidates = dedupeCandidates(rawCandidates);
        ctx.primaryCandidateCount = new Set(candidates.filter((candidate) => candidate.candidateIndex >= 0 && candidate.candidateIndex < 100).map((candidate) => candidate.candidateIndex)).size;
        phaseTiming.candidateGenerationMs = now() - cgStart;
        const ordered = orderCandidates(candidates, config.findMultiple);
        const primaryEngineId = config.decoders.order[0];
        const fallbackEngineIds = config.decoders.order.slice(1);
        const pathological = ordered.some((candidate) => candidate.pathologicalInput);
        const cheap = ["original", "contrast", "invert"];
        const deep = pathological ? [] : config.preprocessOrder.filter((m) => !cheap.includes(m));
        const cheapTargets = config.findMultiple ? ordered : ordered.slice(0, 12);
        const earlyFallbackEngineIds = config.fallbackTiming === "after-cheap"
            ? fallbackEngineIds.filter((engineId) => engineId === "zxing-cpp-wasm")
            : [];
        let earlyFallbackExecuted = false;
        // Phase 1 — cheap pass
        for (const [candidateIndex, candidate] of cheapTargets.entries()) {
            await cooperativeYield(signal);
            throwIfAborted(signal);
            if (timedOut(start, config.timeoutMs, now)) {
                if (signal?.aborted) {
                    if (found.length)
                        return successOutcome(dedupeResults(found, config.resultDeduplication), attempts, start, true, phaseTiming, diagnostics);
                    return fail("cancelled", "Decode cancelled.", true);
                }
                if (found.length)
                    return successOutcome(dedupeResults(found, config.resultDeduplication), attempts, start, false, phaseTiming, diagnostics);
                return fail("timeout", "Decode timed out. Try cropping closer to the QR code, using a clearer image, or reducing image size.");
            }
            if (shouldStopMultiple(ctx)) {
                return successOutcome(dedupeResults(found, config.resultDeduplication), attempts, start, false, phaseTiming, diagnostics);
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
                return successOutcome(dedupeResults(found, config.resultDeduplication), attempts, start, false, phaseTiming, diagnostics);
            }
            // Balanced/Robust give native WASM one high-value full-frame attempt
            // after a deliberately limited jsQR probe. This avoids paying for the
            // entire combinatorial JavaScript preprocessing graph before fallback.
            if (candidateIndex === 0 && earlyFallbackEngineIds.length && !shouldStopMultiple(ctx)) {
                earlyFallbackExecuted = true;
                options.onStage?.("Trying native WebAssembly decoder...");
                const fullFrameTargets = ordered.filter((entry) => entry.cropPadding === "full").slice(0, 1);
                const earlyTargets = fullFrameTargets.length ? fullFrameTargets : ordered.slice(0, 1);
                for (const engineId of earlyFallbackEngineIds) {
                    for (const target of earlyTargets) {
                        const hit = await tryEngine(ctx, engineId, target, "original", 0);
                        if (hit)
                            return hit;
                    }
                }
            }
            if (ctx.failFast)
                continue;
            if (!config.findMultiple && attempts.length >= (config.failFastAfterAttempts ?? 48) && found.length === 0) {
                ctx.failFast = true;
            }
        }
        if (found.length > 0 && shouldStopMultiple(ctx)) {
            return successOutcome(dedupeResults(found, config.resultDeduplication), attempts, start, false, phaseTiming, diagnostics);
        }
        // Balanced/Robust give the native engine one high-value full-frame pass
        // before entering the combinatorial deep preprocessing graph. Fast keeps
        // fallback work in the final phase to protect its first-frame latency.
        if (!earlyFallbackExecuted && earlyFallbackEngineIds.length && !shouldStopMultiple(ctx)) {
            options.onStage?.("Trying native WebAssembly decoder...");
            const fullFrameTargets = ordered.filter((candidate) => candidate.cropPadding === "full").slice(0, 1);
            const earlyTargets = fullFrameTargets.length ? fullFrameTargets : ordered.slice(0, config.findMultiple ? 2 : 1);
            for (const engineId of earlyFallbackEngineIds) {
                for (const candidate of earlyTargets) {
                    const hit = await tryEngine(ctx, engineId, candidate, "original", 0);
                    if (hit)
                        return hit;
                }
            }
        }
        // Phase 2 — deep preprocess (skip if fail-fast with no results)
        if (!pathological && (!ctx.failFast || found.length > 0)) {
            const eligibleDeepTargets = ordered.filter((c, idx) => c.cropPadding === "full" || idx < 6 || c.scale === "original");
            const deepTargets = [
                ...eligibleDeepTargets.filter((candidate) => candidate.cropPadding === "full"),
                ...eligibleDeepTargets.filter((candidate) => candidate.cropPadding !== "full"),
            ];
            for (const candidate of deepTargets) {
                await cooperativeYield(signal);
                throwIfAborted(signal);
                if (timedOut(start, config.timeoutMs, now))
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
            return successOutcome(dedupeResults(found, config.resultDeduplication), attempts, start, false, phaseTiming, diagnostics);
        }
        // Return to lower-ranked candidates only after high-value deep preprocessing.
        if (!config.findMultiple && found.length === 0) {
            for (const candidate of ordered.slice(cheapTargets.length)) {
                await cooperativeYield(signal);
                throwIfAborted(signal);
                if (timedOut(start, config.timeoutMs, now) || attempts.length >= config.maxAttempts)
                    break;
                for (const preprocessing of cheap) {
                    const hit = await tryEngine(ctx, primaryEngineId, candidate, preprocessing, 0);
                    if (hit)
                        return hit;
                }
            }
        }
        // Phase 3 — rotations (only if not fail-fast empty)
        if (!pathological && !ctx.failFast && found.length === 0) {
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
            const zxTargets = ordered.filter((c) => c.cropPadding === "full").slice(0, pathological ? 1 : 2);
            if (zxTargets.length === 0) {
                zxTargets.push(...ordered.slice(0, 2));
            }
            for (const engineId of fallbackEngineIds) {
                for (const candidate of zxTargets) {
                    for (const preprocessing of (pathological ? ["original"] : ["original", "contrast", "invert"])) {
                        const hit = await tryEngine(ctx, engineId, candidate, preprocessing, 0);
                        if (hit)
                            return hit;
                    }
                }
            }
        }
        if (found.length > 0) {
            return successOutcome(dedupeResults(found, config.resultDeduplication), attempts, start, false, phaseTiming, diagnostics);
        }
        if (timedOut(start, config.timeoutMs, now)) {
            if (signal?.aborted) {
                return fail("cancelled", "Decode cancelled.", true);
            }
            return fail("timeout", "Decode timed out. Try cropping closer to the QR code, using a clearer image, or reducing image size.");
        }
        if (config.decoders.order.length > 0 && config.decoders.order.every((engineId) => ctx.failedEngineIds.has(engineId))) {
            const initializationFailed = diagnostics.some((entry) => entry.status === "initialization-failure");
            return fail(initializationFailed ? "engine_initialization_failure" : "engine_execution_failure", initializationFailed ? "Every configured decoder failed to initialize." : "Every configured decoder failed during execution.");
        }
        return fail("no_qr_found", "Could not decode a QR code. Try a clearer crop, better lighting, or a less damaged image.");
    }
    catch (e) {
        if (e instanceof Error && (e.name === "AbortError" || e.message === "cancelled")) {
            if (found.length > 0) {
                return successOutcome(dedupeResults(found, config.resultDeduplication), attempts, start, true, phaseTiming, diagnostics);
            }
            return fail("cancelled", "Decode cancelled.", true);
        }
        const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
        if (["timeout", "unsupported_format", "invalid_image", "engine_initialization_failure", "engine_execution_failure"].includes(code)) {
            return fail(code, code === "timeout"
                ? "Decode timed out. Try cropping closer to the QR code, using a clearer image, or reducing image size."
                : e instanceof Error ? e.message : String(e));
        }
        throw e;
    }
    finally {
        ctx.intermediateCache.dispose();
    }
}
export function successOutcome(results, attempts, start, cancelled, phaseTiming, engineDiagnostics = []) {
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
        elapsedMs: (start > 10_000_000_000 ? Date.now() : monotonicNow()) - start,
        ...(foundOffsets.length ? { timeToFirstResultMs: Math.min(...foundOffsets) } : {}),
        cancelled,
        engineDiagnostics,
        phaseTiming,
    };
}
//# sourceMappingURL=decode-pipeline.js.map