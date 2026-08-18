import { applyCropPadding, cropBuffer, detectCandidateRegions, scaleRectToOriginal } from "./region-detection.js";
import type { CropPadding, PixelBuffer, ScaleLabel, ScoredRegion } from "./types.js";
import { createCoordinateTransform, cropToSourceTransform, IDENTITY_MATRIX, multiplyMatrices, type CoordinateTransform } from "./geometry.js";
import type { ExecutionBudget } from "../runtime/execution-budget.js";

export interface CandidateImage {
  buffer: PixelBuffer;
  candidateIndex: number;
  candidateScore: number;
  cropPadding: CropPadding | "full";
  scale: ScaleLabel;
  scaleFactor: number;
  region: ScoredRegion | null;
  /** Exact candidate-buffer -> original normalized-frame transform. */
  transform: CoordinateTransform;
  pathologicalInput?: boolean;
  highFrequencyRatio?: number;
  candidateCountBeforeCap?: number;
}

function scaleLabel(factor: number): ScaleLabel {
  if (factor < 0.95) return "downscaled";
  if (factor > 1.05) return "upscaled";
  return "original";
}

/** Nearest-neighbor resize for RGBA buffers. */
export function resizeBuffer(src: PixelBuffer, targetW: number, targetH: number, budget?: ExecutionBudget): PixelBuffer {
  const tw = Math.max(1, Math.floor(targetW));
  const th = Math.max(1, Math.floor(targetH));
  if (tw === src.width && th === src.height) {
    return { data: new Uint8ClampedArray(src.data), width: tw, height: th };
  }
  const out = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y++) {
    if ((y & 31) === 0) budget?.throwIfExceeded("candidate-resize");
    const sy = Math.min(src.height - 1, Math.floor((y / th) * src.height));
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x / tw) * src.width));
      const si = (sy * src.width + sx) * 4;
      const di = (y * tw + x) * 4;
      out[di] = src.data[si];
      out[di + 1] = src.data[si + 1];
      out[di + 2] = src.data[si + 2];
      out[di + 3] = src.data[si + 3];
    }
  }
  return { data: out, width: tw, height: th };
}

export function fitMaxSide(src: PixelBuffer, maxSide: number, budget?: ExecutionBudget): { buffer: PixelBuffer; scale: number } {
  const m = Math.max(src.width, src.height);
  if (m <= maxSide) {
    return {
      buffer: { data: new Uint8ClampedArray(src.data), width: src.width, height: src.height },
      scale: 1,
    };
  }
  const scale = maxSide / m;
  return {
    buffer: resizeBuffer(src, Math.floor(src.width * scale), Math.floor(src.height * scale), budget),
    scale,
  };
}

function cappedDimensions(width: number, height: number, scaleFactor: number, maxPixels: number): { width: number; height: number } {
  let w = Math.floor(width * scaleFactor);
  let h = Math.floor(height * scaleFactor);
  const pixels = Math.max(1, w * h);
  if (pixels > maxPixels) {
    const s = Math.sqrt(maxPixels / pixels);
    w = Math.floor(w * s);
    h = Math.floor(h * s);
  }
  const maxSide = 1200;
  if (Math.max(w, h) > maxSide) {
    const s = maxSide / Math.max(w, h);
    w = Math.floor(w * s);
    h = Math.floor(h * s);
  }
  return { width: Math.max(1, w), height: Math.max(1, h) };
}

function capAndResize(cropped: PixelBuffer, scaleFactor: number, maxPixels: number, budget?: ExecutionBudget): PixelBuffer {
  const target = cappedDimensions(cropped.width, cropped.height, scaleFactor, maxPixels);
  return resizeBuffer(cropped, target.width, target.height, budget);
}

function hasCandidateCapacity(out: CandidateImage[], transientBytes: number, outputBytes: number, budget?: ExecutionBudget): boolean {
  if (!budget) return true;
  const retained = out.reduce((sum, candidate) => sum + candidate.buffer.data.byteLength, 0);
  const available = budget.remainingIntermediateBytes();
  const decodeHeadroom = Math.min(8 * 1024 * 1024, Math.floor(available / 3));
  return retained + transientBytes + outputBytes <= available - decodeHeadroom;
}

function pushCandidate(
  out: CandidateImage[],
  full: PixelBuffer,
  region: ScoredRegion,
  originalRect: { x: number; y: number; width: number; height: number },
  padding: CropPadding,
  scaleFactor: number,
  maxPixels: number,
  sourceToFrame: CoordinateTransform,
  budget?: ExecutionBudget,
): boolean {
  budget?.throwIfExceeded("candidate-generation");
  const padded = applyCropPadding(originalRect, full.width, full.height, padding);
  const target = cappedDimensions(padded.width, padded.height, scaleFactor, maxPixels);
  if (!hasCandidateCapacity(out, padded.width * padded.height * 4, target.width * target.height * 4, budget)) return false;
  const cropped = cropBuffer(full, padded, budget);
  const buffer = capAndResize(cropped, scaleFactor, maxPixels, budget);
  const local = cropToSourceTransform(padded, buffer.width, buffer.height, full.width, full.height);
  out.push({
    buffer,
    candidateIndex: region.index >= 0 ? region.index : 0,
    candidateScore: region.score,
    cropPadding: padding,
    scale: scaleLabel(scaleFactor),
    scaleFactor,
    region: { ...region, ...padded },
    transform: createCoordinateTransform(
      multiplyMatrices(sourceToFrame.matrix, local.matrix),
      buffer.width,
      buffer.height,
      sourceToFrame.targetWidth,
      sourceToFrame.targetHeight,
    ),
  });
  return true;
}

/** Conservative high-frequency rejection for independently random pixels. */
export function highFrequencyRatio(image: PixelBuffer, budget?: ExecutionBudget): number {
  if (image.width < 64 || image.height < 64) return 0;
  let high = 0;
  let samples = 0;
  const step = Math.max(1, Math.floor(Math.max(image.width, image.height) / 256));
  for (let y = 0; y < image.height - step; y += step) {
    if ((y & 31) === 0) budget?.throwIfExceeded("entropy-analysis");
    for (let x = 0; x < image.width - step; x += step) {
      const i = (y * image.width + x) * 4;
      const r = (y * image.width + x + step) * 4;
      const d = ((y + step) * image.width + x) * 4;
      const gray = (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3;
      const right = (image.data[r] + image.data[r + 1] + image.data[r + 2]) / 3;
      const down = (image.data[d] + image.data[d + 1] + image.data[d + 2]) / 3;
      high += Math.abs(gray - right) > 48 ? 1 : 0;
      high += Math.abs(gray - down) > 48 ? 1 : 0;
      samples += 2;
    }
  }
  // The retained corpus peaks at 0.235 for valid QR imagery (moire); seeded
  // independent random noise is 0.436. Keep a substantial deterministic gap.
  return samples > 2_000 ? high / samples : 0;
}

export function isPathologicalHighEntropy(image: PixelBuffer, budget?: ExecutionBudget): boolean {
  return highFrequencyRatio(image, budget) > 0.3;
}

/**
 * Prioritized candidates:
 * - top regions get full padding×scale combos
 * - later regions get medium@1 first
 * - full-image fallbacks last
 */
export function generateCandidates(
  full: PixelBuffer,
  options: {
    previewSize: number;
    maxCandidates: number;
    paddings: CropPadding[];
    scales: number[];
    maxPixels: number;
    enableLocalization?: boolean;
    enableFullImageFallback?: boolean;
    enableSplitImageFallback?: boolean;
    enableGridImageFallback?: boolean;
    budget?: ExecutionBudget;
    sourceToFrame?: CoordinateTransform;
  }
): CandidateImage[] {
  const budget = options.budget;
  const sourceToFrame = options.sourceToFrame ?? createCoordinateTransform(IDENTITY_MATRIX, full.width, full.height, full.width, full.height);
  const preview = fitMaxSide(full, options.previewSize, budget);
  const frequencyRatio = highFrequencyRatio(preview.buffer, budget);
  if (frequencyRatio > 0.3) {
    const fitted = fitMaxSide(full, Math.min(600, options.previewSize * 2), budget);
    const local = cropToSourceTransform({ x: 0, y: 0, width: full.width, height: full.height }, fitted.buffer.width, fitted.buffer.height, full.width, full.height);
    return [{
      buffer: fitted.buffer, candidateIndex: -1, candidateScore: 0, cropPadding: "full", scale: "full",
      scaleFactor: fitted.scale, region: null, pathologicalInput: true,
      highFrequencyRatio: frequencyRatio, candidateCountBeforeCap: 1,
      transform: createCoordinateTransform(multiplyMatrices(sourceToFrame.matrix, local.matrix), fitted.buffer.width, fitted.buffer.height, sourceToFrame.targetWidth, sourceToFrame.targetHeight),
    }];
  }
  const regions = options.enableLocalization === false ? [] : detectCandidateRegions(preview.buffer, {
    maxRaw: Math.max(8, options.maxCandidates * 3),
    budget,
  });
  const top = regions.slice(0, options.maxCandidates);
  const out: CandidateImage[] = [];

  const workRegions: ScoredRegion[] =
    options.enableLocalization === false
      ? []
      : top.length > 0
      ? top
      : [
          {
            x: Math.floor(full.width * 0.1),
            y: Math.floor(full.height * 0.1),
            width: Math.floor(full.width * 0.8),
            height: Math.floor(full.height * 0.8),
            score: 0,
            index: 0,
          },
        ];

  workRegions.forEach((region, idx) => {
    const originalRect =
      top.length > 0
        ? scaleRectToOriginal(region, preview.scale)
        : { x: region.x, y: region.y, width: region.width, height: region.height };

    if (idx === 0) {
      for (const padding of options.paddings) {
        for (const scaleFactor of options.scales) {
          pushCandidate(out, full, region, originalRect, padding, scaleFactor, options.maxPixels, sourceToFrame, budget);
        }
      }
    } else {
      // Secondary candidates: medium @ 1 and expanded @ 1
      pushCandidate(out, full, region, originalRect, "medium", 1, options.maxPixels, sourceToFrame, budget);
      pushCandidate(out, full, region, originalRect, "expanded", 1, options.maxPixels, sourceToFrame, budget);
      pushCandidate(out, full, region, originalRect, "medium", 1.35, options.maxPixels, sourceToFrame, budget);
    }
  });

  for (const side of options.enableFullImageFallback === false ? [] : [800, 600, 1200]) {
    budget?.throwIfExceeded("full-image-candidate");
    const scale = Math.min(1, side / Math.max(full.width, full.height));
    if (!hasCandidateCapacity(out, 0, Math.max(1, Math.floor(full.width * scale)) * Math.max(1, Math.floor(full.height * scale)) * 4, budget)) continue;
    const fitted = fitMaxSide(full, side, budget);
    const local = cropToSourceTransform({ x: 0, y: 0, width: full.width, height: full.height }, fitted.buffer.width, fitted.buffer.height, full.width, full.height);
    out.push({
      buffer: fitted.buffer,
      candidateIndex: -1,
      candidateScore: 0,
      cropPadding: "full",
      scale: "full",
      scaleFactor: fitted.scale,
      region: null,
      transform: createCoordinateTransform(multiplyMatrices(sourceToFrame.matrix, local.matrix), fitted.buffer.width, fitted.buffer.height, sourceToFrame.targetWidth, sourceToFrame.targetHeight),
    });
  }

  // Split candidates help multiple-QR images (left / right / quadrants).
  const halves: Array<{ x: number; y: number; width: number; height: number; index: number }> = options.enableSplitImageFallback === false ? [] : [
    { x: 0, y: 0, width: Math.floor(full.width / 2), height: full.height, index: 100 },
    { x: Math.floor(full.width / 2), y: 0, width: Math.ceil(full.width / 2), height: full.height, index: 101 },
    { x: 0, y: 0, width: full.width, height: Math.floor(full.height / 2), index: 102 },
    { x: 0, y: Math.floor(full.height / 2), width: full.width, height: Math.ceil(full.height / 2), index: 103 },
  ];
  for (const h of halves) {
    if (h.width < 32 || h.height < 32) continue;
    budget?.throwIfExceeded("split-image-candidate");
    const splitScale = Math.min(1, 800 / Math.max(h.width, h.height));
    if (!hasCandidateCapacity(out, h.width * h.height * 4, Math.max(1, Math.floor(h.width * splitScale)) * Math.max(1, Math.floor(h.height * splitScale)) * 4, budget)) continue;
    const cropped = cropBuffer(full, h, budget);
    const fitted = fitMaxSide(cropped, 800, budget);
    const local = cropToSourceTransform(h, fitted.buffer.width, fitted.buffer.height, full.width, full.height);
    out.push({
      buffer: fitted.buffer,
      candidateIndex: h.index,
      candidateScore: 1,
      cropPadding: "medium",
      scale: "original",
      scaleFactor: fitted.scale,
      region: { ...h, score: 1, index: h.index },
      transform: createCoordinateTransform(multiplyMatrices(sourceToFrame.matrix, local.matrix), fitted.buffer.width, fitted.buffer.height, sourceToFrame.targetWidth, sourceToFrame.targetHeight),
    });
  }

  if (out.length === 0) {
    const local = cropToSourceTransform({ x: 0, y: 0, width: full.width, height: full.height }, preview.buffer.width, preview.buffer.height, full.width, full.height);
    out.push({
      buffer: preview.buffer, candidateIndex: -1, candidateScore: 0, cropPadding: "full", scale: "full",
      scaleFactor: preview.scale, region: null,
      transform: createCoordinateTransform(multiplyMatrices(sourceToFrame.matrix, local.matrix), preview.buffer.width, preview.buffer.height, sourceToFrame.targetWidth, sourceToFrame.targetHeight),
    });
  }

  // Multi-code-only grid candidates provide one-symbol crops for dense boards.
  if (options.enableGridImageFallback && full.width >= 500 && full.height >= 300) {
    const columns = full.width >= 650 ? 4 : 3;
    const rows = Math.max(2, Math.min(3, Math.round(columns / (full.width / full.height))));
    const overlap = Math.max(8, Math.floor(Math.min(full.width / columns, full.height / rows) * 0.08));
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        budget?.throwIfExceeded("grid-image-candidate");
        const left = Math.max(0, Math.floor(column * full.width / columns) - overlap);
        const top = Math.max(0, Math.floor(row * full.height / rows) - overlap);
        const right = Math.min(full.width, Math.ceil((column + 1) * full.width / columns) + overlap);
        const bottom = Math.min(full.height, Math.ceil((row + 1) * full.height / rows) + overlap);
        const rect = { x: left, y: top, width: right - left, height: bottom - top };
        if (!hasCandidateCapacity(out, rect.width * rect.height * 4, rect.width * rect.height * 4, budget)) continue;
        const cropped = cropBuffer(full, rect, budget);
        const local = cropToSourceTransform(rect, cropped.width, cropped.height, full.width, full.height);
        const index = 200 + row * columns + column;
        out.push({
          buffer: cropped,
          candidateIndex: index,
          candidateScore: 1,
          cropPadding: "medium",
          scale: "original",
          scaleFactor: 1,
          region: { ...rect, score: 1, index },
          transform: createCoordinateTransform(multiplyMatrices(sourceToFrame.matrix, local.matrix), cropped.width, cropped.height, sourceToFrame.targetWidth, sourceToFrame.targetHeight),
        });
      }
    }
  }
  for (const candidate of out) {
    candidate.highFrequencyRatio = frequencyRatio;
    candidate.candidateCountBeforeCap = regions.length;
  }
  return out;
}
