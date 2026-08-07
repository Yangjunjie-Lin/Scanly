import type { NormalizedFrame } from "@scanly/core";
import type { FrameQuality } from "./types.js";

export interface FrameQualityAnalyzerOptions {
  sampleTarget?: number;
  underexposedThreshold?: number;
  overexposedThreshold?: number;
  blurThreshold?: number;
  contrastThreshold?: number;
  glareThreshold?: number;
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }

/** Low-cost luminance/gradient quality analysis; no ML model or retained frame buffer. */
export class FrameQualityAnalyzer {
  private previous: Float32Array | null = null;
  private previousShape = "";

  constructor(private readonly options: FrameQualityAnalyzerOptions = {}) {}

  analyze(frame: NormalizedFrame): FrameQuality {
    const target = Math.max(64, Math.min(4_096, this.options.sampleTarget ?? 1_024));
    const stride = Math.max(1, Math.floor(Math.sqrt((frame.width * frame.height) / target)));
    const values: number[] = [];
    let sum = 0;
    let sumSquares = 0;
    let glare = 0;
    let edgeSum = 0;
    let edgeSquares = 0;
    let edgeCount = 0;
    let previousRow: number[] | null = null;

    for (let y = 0; y < frame.height; y += stride) {
      const row: number[] = [];
      for (let x = 0; x < frame.width; x += stride) {
        const luminance = this.luminance(frame, x, y);
        values.push(luminance);
        row.push(luminance);
        sum += luminance;
        sumSquares += luminance * luminance;
        if (luminance >= 250) glare += 1;
        const left = row.length > 1 ? row[row.length - 2] : luminance;
        const above = previousRow?.[row.length - 1] ?? luminance;
        const gradient = Math.abs(luminance - left) + Math.abs(luminance - above);
        edgeSum += gradient;
        edgeSquares += gradient * gradient;
        edgeCount += 1;
      }
      previousRow = row;
    }

    const count = Math.max(1, values.length);
    const mean = sum / count;
    const variance = Math.max(0, sumSquares / count - mean * mean);
    const gradientMean = edgeSum / Math.max(1, edgeCount);
    const gradientVariance = Math.max(0, edgeSquares / Math.max(1, edgeCount) - gradientMean * gradientMean);
    const brightness = clamp01(mean / 255);
    const contrast = clamp01(Math.sqrt(variance) / 96);
    const edgeDensity = clamp01(gradientMean / 64);
    const blurScore = clamp01((gradientVariance + gradientMean * gradientMean) / 2_500);
    const glareRatio = glare / count;
    const current = Float32Array.from(values, (value) => value / 255);
    const shape = `${frame.width}x${frame.height}:${stride}:${current.length}`;
    let motionEstimate: number | undefined;
    if (this.previous && this.previousShape === shape && this.previous.length === current.length) {
      let delta = 0;
      for (let index = 0; index < current.length; index += 1) delta += Math.abs(current[index] - this.previous[index]);
      motionEstimate = clamp01(delta / current.length);
    }
    this.previous = current;
    this.previousShape = shape;

    const underexposed = brightness < (this.options.underexposedThreshold ?? 0.12);
    const overexposed = brightness > (this.options.overexposedThreshold ?? 0.92);
    const blurred = blurScore < (this.options.blurThreshold ?? 0.08);
    const glareDominated = glareRatio > (this.options.glareThreshold ?? 0.22);
    const lowContrast = contrast < (this.options.contrastThreshold ?? 0.08);
    return {
      blurScore, brightness, contrast, glareRatio, edgeDensity,
      ...(motionEstimate === undefined ? {} : { motionEstimate }),
      underexposed, overexposed, blurred, glareDominated,
      usable: !(underexposed || overexposed || blurred || glareDominated || lowContrast),
    };
  }

  reset(): void { this.previous = null; this.previousShape = ""; }

  private luminance(frame: NormalizedFrame, x: number, y: number): number {
    const row = y * frame.rowStride;
    if (frame.pixelFormat === "gray8" || frame.pixelFormat === "yuv420") return frame.data[row + x] ?? 0;
    const channels = frame.pixelFormat === "rgba8888" ? 4 : 3;
    const offset = row + x * channels;
    return (frame.data[offset] ?? 0) * 0.2126 + (frame.data[offset + 1] ?? 0) * 0.7152 + (frame.data[offset + 2] ?? 0) * 0.0722;
  }
}
