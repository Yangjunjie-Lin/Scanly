import { applyCropPadding, cropBuffer, detectCandidateRegions, scaleRectToOriginal } from "./region-detection";
import type { CropPadding, PixelBuffer, ScaleLabel, ScoredRegion } from "./types";

export interface CandidateImage {
  buffer: PixelBuffer;
  candidateIndex: number;
  candidateScore: number;
  cropPadding: CropPadding | "full";
  scale: ScaleLabel;
  scaleFactor: number;
  region: ScoredRegion | null;
}

function scaleLabel(factor: number): ScaleLabel {
  if (factor < 0.95) return "downscaled";
  if (factor > 1.05) return "upscaled";
  return "original";
}

/** Nearest-neighbor resize for RGBA buffers. */
export function resizeBuffer(src: PixelBuffer, targetW: number, targetH: number): PixelBuffer {
  const tw = Math.max(1, Math.floor(targetW));
  const th = Math.max(1, Math.floor(targetH));
  if (tw === src.width && th === src.height) {
    return { data: new Uint8ClampedArray(src.data), width: tw, height: th };
  }
  const out = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y++) {
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

export function fitMaxSide(src: PixelBuffer, maxSide: number): { buffer: PixelBuffer; scale: number } {
  const m = Math.max(src.width, src.height);
  if (m <= maxSide) {
    return {
      buffer: { data: new Uint8ClampedArray(src.data), width: src.width, height: src.height },
      scale: 1,
    };
  }
  const scale = maxSide / m;
  return {
    buffer: resizeBuffer(src, Math.floor(src.width * scale), Math.floor(src.height * scale)),
    scale,
  };
}

function capAndResize(cropped: PixelBuffer, scaleFactor: number, maxPixels: number): PixelBuffer {
  let w = Math.floor(cropped.width * scaleFactor);
  let h = Math.floor(cropped.height * scaleFactor);
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
  return resizeBuffer(cropped, w, h);
}

function pushCandidate(
  out: CandidateImage[],
  full: PixelBuffer,
  region: ScoredRegion,
  originalRect: { x: number; y: number; width: number; height: number },
  padding: CropPadding,
  scaleFactor: number,
  maxPixels: number
) {
  const padded = applyCropPadding(originalRect, full.width, full.height, padding);
  const cropped = cropBuffer(full, padded);
  out.push({
    buffer: capAndResize(cropped, scaleFactor, maxPixels),
    candidateIndex: region.index >= 0 ? region.index : 0,
    candidateScore: region.score,
    cropPadding: padding,
    scale: scaleLabel(scaleFactor),
    scaleFactor,
    region: { ...region, ...padded },
  });
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
  }
): CandidateImage[] {
  const preview = fitMaxSide(full, options.previewSize);
  const regions = detectCandidateRegions(preview.buffer, {
    maxRaw: Math.max(8, options.maxCandidates * 3),
  });
  const top = regions.slice(0, options.maxCandidates);
  const out: CandidateImage[] = [];

  const workRegions: ScoredRegion[] =
    top.length > 0
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
          pushCandidate(out, full, region, originalRect, padding, scaleFactor, options.maxPixels);
        }
      }
    } else {
      // Secondary candidates: medium @ 1 and expanded @ 1
      pushCandidate(out, full, region, originalRect, "medium", 1, options.maxPixels);
      pushCandidate(out, full, region, originalRect, "expanded", 1, options.maxPixels);
      pushCandidate(out, full, region, originalRect, "medium", 1.35, options.maxPixels);
    }
  });

  for (const side of [800, 600, 1200]) {
    const fitted = fitMaxSide(full, side);
    out.push({
      buffer: fitted.buffer,
      candidateIndex: -1,
      candidateScore: 0,
      cropPadding: "full",
      scale: "full",
      scaleFactor: fitted.scale,
      region: null,
    });
  }

  // Split candidates help multiple-QR images (left / right / quadrants).
  const halves: Array<{ x: number; y: number; width: number; height: number; index: number }> = [
    { x: 0, y: 0, width: Math.floor(full.width / 2), height: full.height, index: 100 },
    { x: Math.floor(full.width / 2), y: 0, width: Math.ceil(full.width / 2), height: full.height, index: 101 },
    { x: 0, y: 0, width: full.width, height: Math.floor(full.height / 2), index: 102 },
    { x: 0, y: Math.floor(full.height / 2), width: full.width, height: Math.ceil(full.height / 2), index: 103 },
  ];
  for (const h of halves) {
    if (h.width < 32 || h.height < 32) continue;
    const cropped = cropBuffer(full, h);
    out.push({
      buffer: fitMaxSide(cropped, 800).buffer,
      candidateIndex: h.index,
      candidateScore: 1,
      cropPadding: "medium",
      scale: "original",
      scaleFactor: 1,
      region: { ...h, score: 1, index: h.index },
    });
  }

  return out;
}
