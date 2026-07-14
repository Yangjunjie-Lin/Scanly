import type {
  DecodeAttempt,
  DecodeFailure,
  DecodeOutcome,
  DecodePipelineOptions,
  DecodeSuccess,
  DecodedCode,
  PixelBuffer,
  PipelineConfig,
  PreprocessMethod,
  RotationDegrees,
} from "./types";
import { DEFAULT_PIPELINE_CONFIG } from "./types";
import { generateCandidates, type CandidateImage } from "./candidate-generation";
import { applyPreprocess } from "./preprocess";
import { rotateBuffer } from "./rotate";
import { decodeWithJsQR } from "./jsqr-decoder";
import { decodeWithZXing } from "./zxing-decoder";
import { dedupeResults, normalizePayload } from "./result-normalizer";

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

function timedOut(start: number, timeoutMs: number): boolean {
  return Date.now() - start >= timeoutMs;
}

/**
 * Attempt plan helpers for tests / documentation.
 * Rotation 0 preprocess methods come first; other rotations follow with a reduced set.
 */
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
};

function pushResult(ctx: AttemptContext, code: DecodedCode): DecodeSuccess | null {
  ctx.found.push(code);
  const unique = dedupeResults(ctx.found);
  // Prefer stable spatial order: lower candidate index first (left/top splits use 100+)
  unique.sort((a, b) => a.candidateIndex - b.candidateIndex);
  ctx.found.length = 0;
  ctx.found.push(...unique);
  if (!ctx.config.findMultiple) {
    return successOutcome(unique, ctx.attempts, ctx.start, false);
  }
  if (unique.length >= ctx.config.maxMultipleResults) {
    return successOutcome(unique, ctx.attempts, ctx.start, false);
  }
  return null;
}

function tryJsQR(
  ctx: AttemptContext,
  candidate: CandidateImage,
  preprocessing: PreprocessMethod,
  rotation: RotationDegrees,
  inversionAttempts: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst" = "attemptBoth"
): DecodeSuccess | null {
  throwIfAborted(ctx.signal);
  if (timedOut(ctx.start, ctx.config.timeoutMs)) {
    return null;
  }
  if (ctx.attempts.length >= ctx.config.maxAttempts) return null;

  const t0 = Date.now();
  let processed = applyPreprocess(candidate.buffer, preprocessing);
  if (rotation !== 0) processed = rotateBuffer(processed, rotation);

  const decoded = decodeWithJsQR(processed, inversionAttempts);
  ctx.attempts.push({
    candidateIndex: candidate.candidateIndex,
    candidateScore: candidate.candidateScore,
    cropPadding: candidate.cropPadding,
    preprocessing,
    scale: candidate.scale,
    scaleFactor: candidate.scaleFactor,
    rotation,
    decoder: "jsqr",
    elapsedMs: Date.now() - t0,
    success: Boolean(decoded?.payload),
    payload: decoded?.payload,
  });

  if (!decoded?.payload) return null;
  const payload = normalizePayload(decoded.payload);
  if (!payload) return null;

  return pushResult(ctx, {
    payload,
    decoder: "jsqr",
    preprocessing,
    candidateIndex: candidate.candidateIndex,
    scale: candidate.scale,
    rotation,
    cropPadding: candidate.cropPadding,
    attemptIndex: ctx.attempts.length - 1,
  });
}

function tryZXing(
  ctx: AttemptContext,
  candidate: CandidateImage,
  preprocessing: PreprocessMethod
): DecodeSuccess | null {
  throwIfAborted(ctx.signal);
  if (timedOut(ctx.start, ctx.config.timeoutMs)) return null;
  if (ctx.attempts.length >= ctx.config.maxAttempts) return null;

  const t0 = Date.now();
  const processed = applyPreprocess(candidate.buffer, preprocessing);
  const decoded = decodeWithZXing(processed);
  ctx.attempts.push({
    candidateIndex: candidate.candidateIndex,
    candidateScore: candidate.candidateScore,
    cropPadding: candidate.cropPadding,
    preprocessing,
    scale: candidate.scale,
    scaleFactor: candidate.scaleFactor,
    rotation: 0,
    decoder: "zxing",
    elapsedMs: Date.now() - t0,
    success: Boolean(decoded?.payload),
    payload: decoded?.payload,
  });

  if (!decoded?.payload) return null;
  const payload = normalizePayload(decoded.payload);
  if (!payload) return null;

  return pushResult(ctx, {
    payload,
    decoder: "zxing",
    preprocessing,
    candidateIndex: candidate.candidateIndex,
    scale: candidate.scale,
    rotation: 0,
    cropPadding: candidate.cropPadding,
    attemptIndex: ctx.attempts.length - 1,
  });
}

/**
 * Breadth-first decode pipeline:
 * 1) cheap preprocess across candidates
 * 2) deeper preprocess on top candidates
 * 3) rotations
 * 4) ZXing final fallback
 */
export async function decodePixelBuffer(
  image: PixelBuffer,
  options: DecodePipelineOptions = {}
): Promise<DecodeOutcome> {
  const config = mergeConfig(options.config);
  const start = Date.now();
  const attempts: DecodeAttempt[] = [];
  const found: DecodedCode[] = [];
  const signal = options.signal;

  const fail = (reason: DecodeFailure["reason"], message: string, cancelled = false): DecodeFailure => ({
    ok: false,
    reason,
    message,
    attempts,
    attemptCount: attempts.length,
    elapsedMs: Date.now() - start,
    cancelled,
  });

  const ctx: AttemptContext = {
    config,
    signal,
    start,
    attempts,
    found,
    onStage: options.onStage,
  };

  try {
    throwIfAborted(signal);

    if (image.width < 1 || image.height < 1 || image.data.length === 0) {
      return fail("empty_image", "Image has no pixel data.");
    }

    options.onStage?.("Detecting candidate regions…");
    const candidates = generateCandidates(image, {
      previewSize: config.previewSize,
      maxCandidates: config.maxCandidates,
      paddings: config.paddings,
      scales: config.scales,
      maxPixels: config.maxPixels,
    });

    // Prefer trying a full-image candidate early (after first few crops).
    // Split halves (index >= 100) are scheduled early when findMultiple is on.
    const earlyFull = candidates.filter((c) => c.cropPadding === "full");
    const splits = candidates.filter((c) => c.candidateIndex >= 100);
    const crops = candidates.filter((c) => c.cropPadding !== "full" && c.candidateIndex < 100);
    const ordered: CandidateImage[] = config.findMultiple
      ? [...crops.slice(0, 2), ...splits, ...earlyFull.slice(0, 1), ...crops.slice(2), ...earlyFull.slice(1)]
      : [...crops.slice(0, 3), ...earlyFull.slice(0, 1), ...crops.slice(3), ...earlyFull.slice(1)];

    const cheap: PreprocessMethod[] = ["original", "contrast", "invert"];
    const deep: PreprocessMethod[] = config.preprocessOrder.filter((m) => !cheap.includes(m));

    // Phase 1 — cheap pass over all ordered candidates
    for (const candidate of ordered) {
      throwIfAborted(signal);
      if (timedOut(start, config.timeoutMs)) {
        if (found.length) return successOutcome(dedupeResults(found), attempts, start, false);
        return fail("timeout", "Decode timed out before a QR code was found.");
      }
      options.onStage?.(
        candidate.cropPadding === "full"
          ? "Trying full image…"
          : `Decoding candidate ${Math.max(0, candidate.candidateIndex) + 1}…`
      );

      for (const preprocessing of cheap) {
        const hit = tryJsQR(ctx, candidate, preprocessing, 0, "attemptBoth");
        if (hit) return hit;
        // Extra inversion probe for inverted codes
        if (preprocessing === "original") {
          const inv = tryJsQR(ctx, candidate, preprocessing, 0, "onlyInvert");
          if (inv) return inv;
        }
        if (preprocessing === "invert") {
          const inv = tryJsQR(ctx, candidate, preprocessing, 0, "dontInvert");
          if (inv) return inv;
        }
        if (config.findMultiple && found.length > 0) break;
      }
      if (!config.findMultiple && found.length > 0) {
        return successOutcome(dedupeResults(found), attempts, start, false);
      }
    }

    // Phase 2 — deeper preprocess on top crops + full images
    const deepTargets = ordered.filter(
      (c, idx) => c.cropPadding === "full" || idx < 8 || c.scale === "original"
    );
    for (const candidate of deepTargets) {
      throwIfAborted(signal);
      if (timedOut(start, config.timeoutMs)) {
        if (found.length) return successOutcome(dedupeResults(found), attempts, start, false);
        return fail("timeout", "Decode timed out before a QR code was found.");
      }
      if (attempts.length >= config.maxAttempts) break;

      for (const preprocessing of deep) {
        const hit = tryJsQR(ctx, candidate, preprocessing, 0);
        if (hit) return hit;
        if (config.findMultiple && found.length > 0) break;
      }
    }

    // Phase 3 — rotations on best few candidates
    const rotateTargets = ordered.filter((c) => c.cropPadding !== "full").slice(0, 4);
    const rotations = config.rotations.filter((r) => r !== 0);
    for (const candidate of rotateTargets) {
      for (const rotation of rotations) {
        for (const preprocessing of ["original", "contrast", "invert", "otsu"] as PreprocessMethod[]) {
          const hit = tryJsQR(ctx, candidate, preprocessing, rotation);
          if (hit) return hit;
        }
      }
    }

    // Phase 4 — ZXing fallback
    if (found.length === 0) {
      options.onStage?.("Backup decoder…");
      const zxTargets = [...earlyFull.slice(0, 2), ...crops.slice(0, 3)];
      for (const candidate of zxTargets) {
        for (const preprocessing of ["original", "contrast", "invert", "otsu"] as PreprocessMethod[]) {
          const hit = tryZXing(ctx, candidate, preprocessing);
          if (hit) return hit;
        }
      }
    }

    if (found.length > 0) {
      return successOutcome(dedupeResults(found), attempts, start, false);
    }

    if (timedOut(start, config.timeoutMs)) {
      return fail("timeout", "Decode timed out before a QR code was found.");
    }

    return fail(
      "no_qr_found",
      "Could not decode a QR code. Try a clearer crop, better lighting, or a less damaged image."
    );
  } catch (e) {
    if (e instanceof Error && (e.name === "AbortError" || e.message === "cancelled")) {
      if (found.length > 0) {
        return successOutcome(dedupeResults(found), attempts, start, true);
      }
      return fail("cancelled", "Decode cancelled.", true);
    }
    throw e;
  }
}

function successOutcome(
  results: DecodedCode[],
  attempts: DecodeAttempt[],
  start: number,
  cancelled: boolean
): DecodeSuccess {
  return {
    ok: true,
    results,
    primary: results[0],
    attempts,
    attemptCount: attempts.length,
    elapsedMs: Date.now() - start,
    cancelled,
  };
}
