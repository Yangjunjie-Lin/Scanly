import { cloneBuffer, luminanceAt, toGrayscale } from "./grayscale.js";
import type { PixelBuffer, PreprocessMethod } from "./types.js";
import type { ExecutionBudget } from "../runtime/execution-budget.js";

/** Min-max contrast stretch on grayscale luminance. */
export function contrastStretch(src: PixelBuffer, budget?: ExecutionBudget): PixelBuffer {
  const gray = toGrayscale(src, budget);
  const data = gray.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    if ((i & 0xffff) === 0) budget?.throwIfExceeded("contrast-analysis");
    const g = data[i];
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = max - min;
  if (range <= 10) return gray;
  const scale = 255 / range;
  for (let i = 0; i < data.length; i += 4) {
    if ((i & 0xffff) === 0) budget?.throwIfExceeded("contrast-apply");
    const stretched = Math.round((data[i] - min) * scale);
    data[i] = data[i + 1] = data[i + 2] = stretched;
  }
  return gray;
}

/** Gamma correction on grayscale (gamma < 1 brightens midtones). */
export function gammaCorrect(src: PixelBuffer, gamma = 0.7, budget?: ExecutionBudget): PixelBuffer {
  const gray = toGrayscale(src, budget);
  const data = gray.data;
  const inv = 1 / Math.max(0.01, gamma);
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    table[i] = Math.min(255, Math.round(255 * Math.pow(i / 255, inv)));
  }
  for (let i = 0; i < data.length; i += 4) {
    if ((i & 0xffff) === 0) budget?.throwIfExceeded("gamma");
    const v = table[data[i]];
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  return gray;
}

/** Invert RGB channels (keeps alpha). */
export function invertColors(src: PixelBuffer, budget?: ExecutionBudget): PixelBuffer {
  const data = new Uint8ClampedArray(src.data);
  for (let i = 0; i < data.length; i += 4) {
    if ((i & 0xffff) === 0) budget?.throwIfExceeded("invert");
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
  return { data, width: src.width, height: src.height };
}

/** Fixed threshold binarization. */
export function fixedThreshold(src: PixelBuffer, threshold: number, budget?: ExecutionBudget): PixelBuffer {
  const gray = toGrayscale(src, budget);
  const data = gray.data;
  const t = Math.max(0, Math.min(255, threshold));
  for (let i = 0; i < data.length; i += 4) {
    if ((i & 0xffff) === 0) budget?.throwIfExceeded("threshold");
    const v = data[i] >= t ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  return gray;
}

/** Otsu automatic threshold. Returns threshold value 0–255. */
export function computeOtsuThreshold(src: PixelBuffer, budget?: ExecutionBudget): number {
  const hist = new Array<number>(256).fill(0);
  const data = src.data;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if ((i & 0xffff) === 0) budget?.throwIfExceeded("otsu-histogram");
    const g = Math.round(luminanceAt(data, i));
    hist[g]++;
    total++;
  }
  if (total === 0) return 128;

  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

export function otsuThreshold(src: PixelBuffer, budget?: ExecutionBudget): PixelBuffer {
  return fixedThreshold(src, computeOtsuThreshold(src, budget), budget);
}

/** Lightweight 3x3 sharpen kernel on grayscale. */
export function sharpen(src: PixelBuffer, budget?: ExecutionBudget): PixelBuffer {
  const gray = toGrayscale(src, budget);
  const { width, height } = gray;
  const srcData = gray.data;
  const out = new Uint8ClampedArray(srcData);
  // Kernel: 0 -1 0 / -1 5 -1 / 0 -1 0
  for (let y = 1; y < height - 1; y++) {
    if ((y & 31) === 0) budget?.throwIfExceeded("sharpen");
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      const c = srcData[i];
      const n = srcData[((y - 1) * width + x) * 4];
      const s = srcData[((y + 1) * width + x) * 4];
      const w = srcData[(y * width + (x - 1)) * 4];
      const e = srcData[(y * width + (x + 1)) * 4];
      const v = Math.max(0, Math.min(255, 5 * c - n - s - w - e));
      out[i] = out[i + 1] = out[i + 2] = v;
    }
  }
  return { data: out, width, height };
}

/** Apply a named preprocessing method. */
export function applyPreprocess(src: PixelBuffer, method: PreprocessMethod, budget?: ExecutionBudget): PixelBuffer {
  switch (method) {
    case "original":
      return cloneBuffer(src);
    case "grayscale":
      return toGrayscale(src, budget);
    case "contrast":
      return contrastStretch(src, budget);
    case "gamma":
      return gammaCorrect(src, 0.7, budget);
    case "invert":
      return invertColors(src, budget);
    case "threshold-115":
      return fixedThreshold(src, 115, budget);
    case "threshold-140":
      return fixedThreshold(src, 140, budget);
    case "threshold-165":
      return fixedThreshold(src, 165, budget);
    case "otsu":
      return otsuThreshold(src, budget);
    case "sharpen":
      return sharpen(src, budget);
    default: {
      const _exhaustive: never = method;
      return _exhaustive;
    }
  }
}
