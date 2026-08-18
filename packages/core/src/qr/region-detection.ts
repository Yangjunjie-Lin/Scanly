import type { CropPadding, PixelBuffer, Rect, ScoredRegion } from "./types.js";
import type { ExecutionBudget } from "../runtime/execution-budget.js";

const PADDING_RATIOS: Record<CropPadding, number> = {
  tight: 0.05,
  medium: 0.12,
  expanded: 0.22,
};

/** Clamp a rectangle to image bounds. */
export function clampRect(rect: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.min(width - 1, Math.floor(rect.x)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(rect.y)));
  const maxW = width - x;
  const maxH = height - y;
  const w = Math.max(1, Math.min(maxW, Math.floor(rect.width)));
  const h = Math.max(1, Math.min(maxH, Math.floor(rect.height)));
  return { x, y, width: w, height: h };
}

/** Expand a rect by relative padding, then clamp to bounds (edge-safe). */
export function applyCropPadding(
  rect: Rect,
  imageWidth: number,
  imageHeight: number,
  padding: CropPadding
): Rect {
  const ratio = PADDING_RATIOS[padding];
  const padX = Math.round(rect.width * ratio);
  const padY = Math.round(rect.height * ratio);
  return clampRect(
    {
      x: rect.x - padX,
      y: rect.y - padY,
      width: rect.width + padX * 2,
      height: rect.height + padY * 2,
    },
    imageWidth,
    imageHeight
  );
}

/** Intersection-over-union of two rects. */
export function iou(a: Rect, b: Rect): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const iw = Math.max(0, x2 - x1);
  const ih = Math.max(0, y2 - y1);
  const inter = iw * ih;
  if (inter <= 0) return 0;
  const union = a.width * a.height + b.width * b.height - inter;
  return union <= 0 ? 0 : inter / union;
}

/** Non-maximum suppression for scored regions. */
export function nonMaximumSuppression(
  regions: ScoredRegion[],
  iouThreshold = 0.45,
  maxKeep = 5
): ScoredRegion[] {
  const sorted = [...regions].sort((a, b) => b.score - a.score);
  const kept: ScoredRegion[] = [];
  for (const candidate of sorted) {
    if (kept.length >= maxKeep) break;
    const overlaps = kept.some((k) => iou(k, candidate) >= iouThreshold);
    if (!overlaps) kept.push(candidate);
  }
  return kept.map((r, index) => ({ ...r, index }));
}

/**
 * Edge-density grid scan returning top-N candidate regions on the preview image.
 * Coordinates are in preview pixel space.
 */
export function detectCandidateRegions(
  image: PixelBuffer,
  options?: { gridSize?: number; windowCells?: number; maxRaw?: number; budget?: ExecutionBudget }
): ScoredRegion[] {
  const { data, width, height } = image;
  const gridSize = options?.gridSize ?? 20;
  const windowCells = options?.windowCells ?? 5;
  const maxRaw = options?.maxRaw ?? 24;
  const cellW = Math.max(1, Math.floor(width / gridSize));
  const cellH = Math.max(1, Math.floor(height / gridSize));

  const raw: ScoredRegion[] = [];

  for (let gy = 0; gy <= gridSize - windowCells; gy++) {
    options?.budget?.throwIfExceeded("region-scoring");
    for (let gx = 0; gx <= gridSize - windowCells; gx++) {
      let density = 0;
      for (let dy = 0; dy < windowCells; dy++) {
        for (let dx = 0; dx < windowCells; dx++) {
          const cx = (gx + dx) * cellW;
          const cy = (gy + dy) * cellH;
          const px = Math.min(Math.floor(cx + cellW / 2), width - 1);
          const py = Math.min(Math.floor(cy + cellH / 2), height - 1);
          const idx = (py * width + px) * 4;
          const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          if (px < width - 1) {
            const rIdx = (py * width + px + 1) * 4;
            const right = (data[rIdx] + data[rIdx + 1] + data[rIdx + 2]) / 3;
            density += Math.abs(gray - right);
          }
          if (py < height - 1) {
            const dIdx = ((py + 1) * width + px) * 4;
            const down = (data[dIdx] + data[dIdx + 1] + data[dIdx + 2]) / 3;
            density += Math.abs(gray - down);
          }
        }
      }
      if (density > 800) {
        raw.push({
          x: gx * cellW,
          y: gy * cellH,
          width: windowCells * cellW,
          height: windowCells * cellH,
          score: density,
          index: -1,
        });
      }
    }
  }

  raw.sort((a, b) => b.score - a.score);
  return nonMaximumSuppression(raw.slice(0, maxRaw), 0.45, options?.maxRaw ? Math.min(8, options.maxRaw) : 5);
}

/** Scale a preview-space rect to original image coordinates. */
export function scaleRectToOriginal(rect: Rect, previewScale: number): Rect {
  const inv = 1 / previewScale;
  return {
    x: Math.floor(rect.x * inv),
    y: Math.floor(rect.y * inv),
    width: Math.floor(rect.width * inv),
    height: Math.floor(rect.height * inv),
  };
}

/** Crop a region from a pixel buffer. */
export function cropBuffer(src: PixelBuffer, rect: Rect, budget?: ExecutionBudget): PixelBuffer {
  const r = clampRect(rect, src.width, src.height);
  const out = new Uint8ClampedArray(r.width * r.height * 4);
  for (let y = 0; y < r.height; y++) {
    if ((y & 31) === 0) budget?.throwIfExceeded("candidate-crop");
    const srcStart = ((r.y + y) * src.width + r.x) * 4;
    const dstStart = y * r.width * 4;
    out.set(src.data.subarray(srcStart, srcStart + r.width * 4), dstStart);
  }
  return { data: out, width: r.width, height: r.height };
}
