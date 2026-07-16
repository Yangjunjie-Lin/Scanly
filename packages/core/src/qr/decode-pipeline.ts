import type {
  DecodeAttempt,
  DecodeFailure,
  DecodeOutcome,
  DecodePipelineOptions,
  DecodeSuccess,
  DecodedCode,
  DecoderName,
  PixelBuffer,
  PipelineConfig,
  PreprocessMethod,
  PhaseTiming,
  NonEmptyArray,
  RotationDegrees,
  PipelineEngineExecutor,
} from "./types.js";
import { DEFAULT_PIPELINE_CONFIG, validatePipelineConfig } from "./types.js";
import { dedupeCandidates } from "./candidate-dedupe.js";
import { generateCandidates, type CandidateImage } from "./candidate-generation.js";
import { applyPreprocess } from "./preprocess.js";
import { rotateBuffer } from "./rotate.js";
import { dedupeResults, normalizePayload } from "./result-normalizer.js";
import { mapAndClampPoints, multiplyMatrices, rotatedToSourceMatrix } from "./geometry.js";
import { ExecutionBudget, monotonicNow } from "../runtime/execution-budget.js";
import type { FrameMemoryBudget, MemoryLease } from "../runtime/memory-budget.js";

function mergeConfig(partial?: Partial<PipelineConfig>): PipelineConfig {
  return { ...DEFAULT_PIPELINE_CONFIG, ...partial };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error("cancelled");
    err.name = "AbortError";
    throw err;
  }
}

function timedOut(start: number, timeoutMs: number, now: () => number): boolean {
  return now() - start >= timeoutMs;
}

/** Yield to the event loop so AbortSignal and UI can run between attempts. */
async function cooperativeYield(signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  throwIfAborted(signal);
}

function decoderEnabled(config: PipelineConfig, name: DecoderName): boolean {
  return config.decoders?.order.includes(name) ?? false;
}

function allRequiredFound(payloads: string[], required?: string[]): boolean {
  if (!required?.length) return false;
  return required.every((p) => payloads.includes(p));
}

export function buildAttemptPlan(
  preprocessOrder: PreprocessMethod[],
  rotations: RotationDegrees[],
  budgetRemaining: number
): Array<{ preprocessing: PreprocessMethod; rotation: RotationDegrees }> {
  const plan: Array<{ preprocessing: PreprocessMethod; rotation: RotationDegrees }> = [];
  for (const preprocessing of preprocessOrder) {
    plan.push({ preprocessing, rotation: 0 });
  }
  const rotatedPreprocess: PreprocessMethod[] = ["original", "contrast", "invert", "otsu"];
  for (const rotation of rotations) {
    if (rotation === 0) continue;
    for (const preprocessing of rotatedPreprocess) {
      plan.push({ preprocessing, rotation });
    }
  }
  return plan.slice(0, Math.max(0, budgetRemaining));
}

type AttemptContext = {
  config: PipelineConfig;
  signal?: AbortSignal;
  start: number;
  attempts: DecodeAttempt[];
  found: DecodedCode[];
  onStage?: (stage: string) => void;
  onProgress?: DecodePipelineOptions["onProgress"];
  phaseTiming: PhaseTiming;
  candidatesSinceNew: number;
  failFast: boolean;
  intermediateCache: AttemptImageCache;
  engineExecutor: PipelineEngineExecutor;
  budget: ExecutionBudget;
  now: () => number;
};

class AttemptImageCache {
  private readonly entries = new Map<string, PixelBuffer>();
  private readonly ids = new WeakMap<PixelBuffer, number>();
  private sequence = 0;
  private retainedBytes = 0;
  private readonly leases: MemoryLease[] = [];
  constructor(private readonly maxEntries: number, private readonly maxBytes: number, private readonly memoryBudget?: FrameMemoryBudget) {}
  key(buffer: PixelBuffer, preprocessing: PreprocessMethod, rotation: RotationDegrees): string {
    let id = this.ids.get(buffer);
    if (id === undefined) {
      id = ++this.sequence;
      this.ids.set(buffer, id);
    }
    return `${id}:${preprocessing}:${rotation}`;
  }
  getOrCreate(key: string, create: () => PixelBuffer): PixelBuffer {
    const existing = this.entries.get(key);
    if (existing) return existing;
    const value = create();
    const bytes = value.data.byteLength;
    const sharedCapacity = !this.memoryBudget || this.memoryBudget.remainingBytes >= bytes;
    if (this.entries.size < this.maxEntries && this.retainedBytes + bytes <= this.maxBytes && sharedCapacity) {
      const lease = this.memoryBudget?.reserve(bytes, `preprocess-cache:${key}`);
      this.entries.set(key, value);
      this.retainedBytes += bytes;
      if (lease) this.leases.push(lease);
    }
    return value;
  }
  dispose(): void {
    for (const lease of this.leases) lease.release();
    this.leases.length = 0;
    this.entries.clear();
    this.retainedBytes = 0;
  }
}

function processedFor(
  ctx: AttemptContext,
  candidate: CandidateImage,
  preprocessing: PreprocessMethod,
  rotation: RotationDegrees
): PixelBuffer {
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

function shouldStopMultiple(ctx: AttemptContext): boolean {
  const payloads = ctx.found.map((r) => r.payload);
  const { config } = ctx;

  // A stall can end collection only after at least one real decode.
  if (payloads.length === 0) return false;

  if (config.requiredPayloads?.length) {
    // Known completeness contracts must not stop on a heuristic stall.
    return allRequiredFound(payloads, config.requiredPayloads);
  }
  if (config.expectedResultCount && payloads.length >= config.expectedResultCount) {
    return true;
  }
  if (!config.findMultiple) return false;
  if (payloads.length >= config.maxMultipleResults) return true;
  const stall = config.stallCandidateLimit ?? 8;
  const scaledStall = stall + Math.max(0, payloads.length - 1) * 3;
  if (ctx.candidatesSinceNew >= scaledStall) return true;
  return false;
}

function pushResult(ctx: AttemptContext, code: DecodedCode): DecodeSuccess | null {
  const prevSize = ctx.found.length;
  ctx.found.push(code);
  const unique = dedupeResults(ctx.found, ctx.config.resultDeduplication);
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

function onCandidateDone(ctx: AttemptContext, hadNewResult: boolean): void {
  if (!hadNewResult) ctx.candidatesSinceNew += 1;
}

async function tryEngine(
  ctx: AttemptContext,
  engineId: string,
  candidate: CandidateImage,
  preprocessing: PreprocessMethod,
  rotation: RotationDegrees,
): Promise<DecodeSuccess | null> {
  throwIfAborted(ctx.signal);
  ctx.budget.throwIfExceeded("decoder-attempt");
  if (timedOut(ctx.start, ctx.config.timeoutMs, ctx.now)) return null;
  if (ctx.attempts.length >= ctx.config.maxAttempts) return null;
  if (!decoderEnabled(ctx.config, engineId)) return null;

  const t0 = ctx.now();
  const processed = processedFor(ctx, candidate, preprocessing, rotation);

  const t1 = ctx.now();
  const decoded = await ctx.engineExecutor.decode(engineId, processed, {
    signal: ctx.signal,
    findMultiple: ctx.config.findMultiple,
    inversion: preprocessing === "invert" ? "inverted" : "original",
  });
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
    if (decoded.category === "not-found") return null;
    const reasons = {
      "unsupported-format": "unsupported_format",
      "invalid-input": "invalid_image",
      initialization: "engine_initialization_failure",
      execution: "engine_execution_failure",
      cancelled: "cancelled",
      timeout: "timeout",
    } as const;
    const reason = reasons[decoded.category];
    const error = Object.assign(new Error(decoded.message), { code: reason, name: reason === "cancelled" ? "AbortError" : reason === "timeout" ? "TimeoutError" : "EngineError" });
    throw error;
  }
  let completed: DecodeSuccess | null = null;
  for (const result of decoded.results) {
    const payload = normalizePayload(result.text);
    if (!payload) continue;
    const candidateToFrame = multiplyMatrices(
      candidate.transform.matrix,
      rotatedToSourceMatrix(rotation, candidate.buffer.width, candidate.buffer.height),
    );
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
      cornerPoints,
      symbologyIdentifier: result.symbologyIdentifier,
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

export function orderCandidates(candidates: CandidateImage[], findMultiple: boolean): CandidateImage[] {
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
export async function decodePixelBuffer(
  image: PixelBuffer,
  options: DecodePipelineOptions = {}
): Promise<DecodeOutcome> {
  const config = mergeConfig(options.config);
  const now = options.executionBudget ? () => options.executionBudget!.now() : monotonicNow;
  const start = now();
  const attempts: DecodeAttempt[] = [];
  const found: DecodedCode[] = [];
  const signal = options.signal;
  const engineExecutor = options.engineExecutor;
  const phaseTiming: PhaseTiming = {
    candidateGenerationMs: 0,
    preprocessMs: 0,
    rotationMs: 0,
  };

  const fail = (reason: DecodeFailure["reason"], message: string, cancelled = false): DecodeFailure => ({
    ok: false,
    reason,
    message,
    attempts,
    attemptCount: attempts.length,
    elapsedMs: now() - start,
    cancelled,
    phaseTiming,
  });

  const ctx: AttemptContext = {
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
    intermediateCache: new AttemptImageCache(
      config.maxIntermediateAllocations ?? 24,
      config.maxIntermediateBytes ?? 64 * 1024 * 1024,
      options.memoryBudget,
    ),
    engineExecutor: engineExecutor as PipelineEngineExecutor,
    budget: options.executionBudget ?? new ExecutionBudget({
      signal,
      deadlineMs: start + config.timeoutMs,
      now,
      remainingAttempts: () => config.maxAttempts - attempts.length,
      memory: options.memoryBudget,
    }),
    now,
  };

  try {
    throwIfAborted(signal);

    const configurationIssues = validatePipelineConfig(config);
    if (!engineExecutor) configurationIssues.push("engineExecutor is required; register decoder plugins and execute through CaptureRouter.");
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
      budget: ctx.budget,
    });
    const candidates = dedupeCandidates(rawCandidates);
    phaseTiming.candidateGenerationMs = now() - cgStart;

    const ordered = orderCandidates(candidates, config.findMultiple);
    const primaryEngineId = config.decoders.order[0];
    const fallbackEngineIds = config.decoders.order.slice(1);
    const pathological = ordered.some((candidate) => candidate.pathologicalInput);
    const cheap: PreprocessMethod[] = pathological ? ["original"] : ["original", "contrast", "invert"];
    const deep: PreprocessMethod[] = pathological ? [] : config.preprocessOrder.filter((m) => !cheap.includes(m));
    const cheapTargets = config.findMultiple ? ordered : ordered.slice(0, 12);

    // Phase 1 — cheap pass
    for (const candidate of cheapTargets) {
      await cooperativeYield(signal);
      throwIfAborted(signal);
      if (timedOut(start, config.timeoutMs, now)) {
        if (signal?.aborted) {
          if (found.length) return successOutcome(dedupeResults(found, config.resultDeduplication), attempts, start, true, phaseTiming);
          return fail("cancelled", "Decode cancelled.", true);
        }
        if (found.length) return successOutcome(dedupeResults(found, config.resultDeduplication), attempts, start, false, phaseTiming);
        return fail(
          "timeout",
          "Decode timed out. Try cropping closer to the QR code, using a clearer image, or reducing image size."
        );
      }
      if (shouldStopMultiple(ctx)) {
        return successOutcome(dedupeResults(found, config.resultDeduplication), attempts, start, false, phaseTiming);
      }

      options.onStage?.(
        candidate.cropPadding === "full"
          ? "Trying full image…"
          : `Decoding candidate ${Math.max(0, candidate.candidateIndex) + 1}…`
      );

      const before = found.length;
      const candidateMethods = config.findMultiple && found.length > 0 ? (["original", "contrast"] as PreprocessMethod[]) : cheap;
      for (const preprocessing of candidateMethods) {
        const hit = await tryEngine(ctx, primaryEngineId, candidate, preprocessing, 0);
        if (hit) return hit;
        if (config.findMultiple && shouldStopMultiple(ctx)) break;
      }
      onCandidateDone(ctx, found.length > before);

      if (!config.findMultiple && found.length > 0) {
        return successOutcome(dedupeResults(found, config.resultDeduplication), attempts, start, false, phaseTiming);
      }
      if (ctx.failFast) continue;
      if (!config.findMultiple && attempts.length >= (config.failFastAfterAttempts ?? 48) && found.length === 0) {
        ctx.failFast = true;
      }
    }

    if (found.length > 0 && shouldStopMultiple(ctx)) {
        return successOutcome(dedupeResults(found, config.resultDeduplication), attempts, start, false, phaseTiming);
    }

    // Phase 2 — deep preprocess (skip if fail-fast with no results)
    if (!pathological && (!ctx.failFast || found.length > 0)) {
      const eligibleDeepTargets = ordered.filter(
        (c, idx) => c.cropPadding === "full" || idx < 6 || c.scale === "original"
      );
      const deepTargets = [
        ...eligibleDeepTargets.filter((candidate) => candidate.cropPadding === "full"),
        ...eligibleDeepTargets.filter((candidate) => candidate.cropPadding !== "full"),
      ];
      for (const candidate of deepTargets) {
        await cooperativeYield(signal);
        throwIfAborted(signal);
        if (timedOut(start, config.timeoutMs, now)) break;
        if (attempts.length >= config.maxAttempts) break;
        if (shouldStopMultiple(ctx)) break;

        const before = found.length;
        for (const preprocessing of deep) {
          const hit = await tryEngine(ctx, primaryEngineId, candidate, preprocessing, 0);
          if (hit) return hit;
        }
        onCandidateDone(ctx, found.length > before);
      }
    }

    if (found.length > 0 && shouldStopMultiple(ctx)) {
      return successOutcome(dedupeResults(found, config.resultDeduplication), attempts, start, false, phaseTiming);
    }

    // Return to lower-ranked candidates only after high-value deep preprocessing.
    if (!config.findMultiple && found.length === 0) {
      for (const candidate of ordered.slice(cheapTargets.length)) {
        await cooperativeYield(signal);
        throwIfAborted(signal);
        if (timedOut(start, config.timeoutMs, now) || attempts.length >= config.maxAttempts) break;
        for (const preprocessing of cheap) {
          const hit = await tryEngine(ctx, primaryEngineId, candidate, preprocessing, 0);
          if (hit) return hit;
        }
      }
    }

    // Phase 3 — rotations (only if not fail-fast empty)
    if (!pathological && !ctx.failFast && found.length === 0) {
      const rotateTargets = ordered.filter((c) => c.cropPadding !== "full").slice(0, 3);
      const rotations = config.rotations.filter((r) => r !== 0);
      for (const candidate of rotateTargets) {
        if (attempts.length >= config.maxAttempts) break;
        for (const rotation of rotations) {
          for (const preprocessing of ["original", "contrast", "invert"] as PreprocessMethod[]) {
            const hit = await tryEngine(ctx, primaryEngineId, candidate, preprocessing, rotation);
            if (hit) return hit;
          }
        }
      }
    }

    // Phase 4 - registered fallback engines in scenario order.
    if (!pathological && found.length === 0 && fallbackEngineIds.length) {
      options.onStage?.("Backup decoder...");
      const zxTargets = ordered.filter((c) => c.cropPadding === "full").slice(0, 2);
      if (zxTargets.length === 0) {
        zxTargets.push(...ordered.slice(0, 2));
      }
      for (const engineId of fallbackEngineIds) {
        for (const candidate of zxTargets) {
          for (const preprocessing of ["original", "contrast", "invert"] as PreprocessMethod[]) {
            const hit = await tryEngine(ctx, engineId, candidate, preprocessing, 0);
            if (hit) return hit;
          }
        }
      }
    }

    if (found.length > 0) {
      return successOutcome(dedupeResults(found, config.resultDeduplication), attempts, start, false, phaseTiming);
    }

    if (timedOut(start, config.timeoutMs, now)) {
      if (signal?.aborted) {
        return fail("cancelled", "Decode cancelled.", true);
      }
      return fail(
        "timeout",
        "Decode timed out. Try cropping closer to the QR code, using a clearer image, or reducing image size."
      );
    }

    return fail(
      "no_qr_found",
      "Could not decode a QR code. Try a clearer crop, better lighting, or a less damaged image."
    );
  } catch (e) {
    if (e instanceof Error && (e.name === "AbortError" || e.message === "cancelled")) {
      if (found.length > 0) {
        return successOutcome(dedupeResults(found, config.resultDeduplication), attempts, start, true, phaseTiming);
      }
      return fail("cancelled", "Decode cancelled.", true);
    }
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
    if (["timeout", "unsupported_format", "invalid_image", "engine_initialization_failure", "engine_execution_failure"].includes(code)) {
      return fail(
        code as DecodeFailure["reason"],
        code === "timeout"
          ? "Decode timed out. Try cropping closer to the QR code, using a clearer image, or reducing image size."
          : e instanceof Error ? e.message : String(e),
      );
    }
    throw e;
  } finally {
    ctx.intermediateCache.dispose();
  }
}

export function successOutcome(
  results: DecodedCode[],
  attempts: DecodeAttempt[],
  start: number,
  cancelled: boolean,
  phaseTiming: PhaseTiming
): DecodeSuccess {
  if (results.length === 0) {
    throw new Error("Decode success invariant violated: results must be non-empty.");
  }
  const nonEmptyResults = results as NonEmptyArray<DecodedCode>;
  const foundOffsets = nonEmptyResults
    .map((result) => result.foundAtMs)
    .filter((value): value is number => value !== undefined);
  return {
    ok: true,
    results: nonEmptyResults,
    primary: nonEmptyResults[0],
    attempts,
    attemptCount: attempts.length,
    elapsedMs: (start > 10_000_000_000 ? Date.now() : monotonicNow()) - start,
    ...(foundOffsets.length ? { timeToFirstResultMs: Math.min(...foundOffsets) } : {}),
    cancelled,
    phaseTiming,
  };
}
