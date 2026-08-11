import type { NormalizedFrame } from "../contracts/frame.js";
import { affineRecoveryTransform, composeRecoveryTransforms, curvedRecoveryTransform, projectiveRecoveryTransform } from "./coordinate-transform.js";
import { RecoveryRouteRegistry } from "./recovery-route-registry.js";
import { adaptiveThreshold, asRgba, claheLike, createRecoveryCandidate, glareAlternative, illuminationNormalize, localContrastNormalize, morphologicalClose, morphologicalGradient, morphologicalOpen, originalRecoveryCandidate, padNeutral, resizeBilinear, resizeNearest, unsharpMask, writeSample } from "./pixels.js";
import type { RecoveryContext, RecoveryCandidate, RecoveryRoute, RecoveryRouteId } from "./types.js";

export class LowContrastRecoveryRoute implements RecoveryRoute {
  readonly id = "low-contrast" as const;
  supports(context: RecoveryContext): boolean { return context.diagnosis.lowContrast !== "none" || context.diagnosis.underexposure !== "none" || context.diagnosis.overexposure !== "none"; }
  estimateCost(context: RecoveryContext): number { return context.framePixels * Math.min(3, context.budget.maximumCandidates ?? 2); }
  async run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]> {
    const data = asRgba(frame); const results: RecoveryCandidate[] = [];
    if (canAdd(context, results)) results.push(createRecoveryCandidate(frame, this.id, localContrastNormalize(data, frame.width, frame.height), frame.width, frame.height, identity(), context.memory, "normalized", ["local-contrast-normalization"]));
    if (canAdd(context, results)) results.push(createRecoveryCandidate(frame, this.id, claheLike(data, frame.width, frame.height), frame.width, frame.height, identity(), context.memory, "grayscale", ["clahe-like-clipped-local-contrast"]));
    if (canAdd(context, results)) results.push(createRecoveryCandidate(frame, this.id, adaptiveThreshold(data, frame.width, frame.height), frame.width, frame.height, identity(), context.memory, "binary", ["adaptive-threshold"]));
    return results;
  }
}

export class IlluminationRecoveryRoute implements RecoveryRoute {
  readonly id = "illumination" as const;
  supports(context: RecoveryContext): boolean { return (context.diagnosis.evidence.illuminationVariation ?? 0) > 0.075 || context.diagnosis.underexposure !== "none" || context.diagnosis.overexposure !== "none"; }
  estimateCost(context: RecoveryContext): number { return context.framePixels; }
  async run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]> {
    return [createRecoveryCandidate(frame, this.id, illuminationNormalize(asRgba(frame), frame.width, frame.height), frame.width, frame.height, identity(), context.memory, "normalized", ["local-background-illumination-estimate", "illumination-normalize"])];
  }
}

export class BlurRecoveryRoute implements RecoveryRoute {
  readonly id = "blur" as const;
  supports(context: RecoveryContext): boolean { return context.diagnosis.blur !== "none" || context.diagnosis.motionBlur !== "none"; }
  estimateCost(context: RecoveryContext): number { return context.framePixels; }
  async run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]> {
    const data = asRgba(frame); const direction = context.diagnosis.motionBlur !== "none" ? (context.diagnosis.evidence.anisotropy > 0.32 ? "horizontal" : "vertical") : "both";
    return [createRecoveryCandidate(frame, this.id, unsharpMask(data, frame.width, frame.height, 1.1, direction), frame.width, frame.height, identity(), context.memory, "normalized", ["diagnosed-blur", `direction-aware-${direction}-unsharp-mask`])];
  }
}

export class GlareRecoveryRoute implements RecoveryRoute {
  readonly id = "glare" as const;
  supports(context: RecoveryContext): boolean { return context.diagnosis.glare !== "none" && ["robust", "industrial", "dpm-experimental"].includes(context.profile); }
  estimateCost(context: RecoveryContext): number { return context.framePixels; }
  async run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]> {
    const result = glareAlternative(asRgba(frame), frame.width, frame.height);
    if (result.glareRatio >= 0.45) return [];
    return [createRecoveryCandidate(frame, this.id, result.data, frame.width, frame.height, identity(), context.memory, "binary", ["saturated-region-mask", "alternate-threshold", "glare-not-dominated"])];
  }
}

export class PerspectiveRecoveryRoute implements RecoveryRoute {
  readonly id = "perspective" as const;
  supports(context: RecoveryContext): boolean { return context.diagnosis.perspectiveDistortion !== "none" || (["robust", "industrial", "dpm-experimental"].includes(context.profile) && context.candidateRegions.length > 0); }
  estimateCost(context: RecoveryContext): number { return Math.min(context.budget.maximumRectifiedArea ?? context.framePixels, context.framePixels) * Math.min(3, context.budget.maximumPerspectiveTransforms ?? 1); }
  async run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]> {
    const maximumTransforms = context.budget.maximumPerspectiveTransforms ?? 1;
    if (maximumTransforms < 1) return [];
    const fullFrame = { x: 0, y: 0, width: frame.width, height: frame.height };
    const diagnosedScore = context.diagnosis.evidence.perspectiveScore ?? 0;
    const specifications = context.candidateRegions.slice(0, Math.max(0, maximumTransforms - 2)).map((candidate) => ({ region: candidate.boundingBox, score: diagnosedScore, reason: "candidate-region" }));
    specifications.push({ region: fullFrame, score: diagnosedScore, reason: "full-frame-fallback" });
    if (specifications.length < maximumTransforms && diagnosedScore < 0.98) specifications.push({ region: fullFrame, score: Math.min(1, diagnosedScore + 0.2), reason: "full-frame-stronger-hypothesis" });
    const data = asRgba(frame); const results: RecoveryCandidate[] = [];
    for (const specification of specifications.slice(0, maximumTransforms)) {
      const region = specification.region; const quad = estimateQuadrilateral(region, specification.score);
      const area = Math.max(1, region.width * region.height); const ratio = region.width / Math.max(1, region.height);
      const targetWidth = clampInt(Math.sqrt(area * ratio), 32, 1_024); const targetHeight = clampInt(Math.sqrt(area / Math.max(0.01, ratio)), 32, 1_024);
      if (targetWidth * targetHeight > (context.budget.maximumRectifiedArea ?? Number.MAX_SAFE_INTEGER)) continue;
      const destination: [Point, Point, Point, Point] = [{ x: 0, y: 0 }, { x: targetWidth - 1, y: 0 }, { x: targetWidth - 1, y: targetHeight - 1 }, { x: 0, y: targetHeight - 1 }];
      const sourceToDestination = solveHomography(quad, destination); const destinationToSource = solveHomography(destination, quad); const rectified = new Uint8ClampedArray(targetWidth * targetHeight * 4);
      for (let y = 0; y < targetHeight; y += 1) for (let x = 0; x < targetWidth; x += 1) writeSample(rectified, (y * targetWidth + x) * 4, data, frame.width, frame.height, ...pointTuple(project(destinationToSource, { x, y })));
      results.push(createRecoveryCandidate(frame, this.id, rectified, targetWidth, targetHeight, projectiveRecoveryTransform(destinationToSource, sourceToDestination), context.memory, "rectified", ["quadrilateral-estimate", "bounded-homography", specification.reason, `perspective-score:${specification.score.toFixed(3)}`, `rectified-area:${targetWidth * targetHeight}`]));
      if (!canAdd(context, results)) break;
    }
    return results;
  }
}

export interface CurvatureEstimate { strength: number; confidence: number; direction: "horizontal" | "vertical"; }
export interface CurvedBarcodeCandidate extends RecoveryCandidate { curvature: CurvatureEstimate; }

export class CurvatureEstimator {
  estimate(context: RecoveryContext): CurvatureEstimate {
    const score = context.diagnosis.evidence.curvatureScore ?? 0;
    return { strength: Math.max(0.04, Math.min(0.28, score * 0.22)), confidence: Math.min(1, score), direction: "horizontal" };
  }
}

export class CurvedRecoveryRoute implements RecoveryRoute {
  readonly id = "curved" as const;
  private readonly estimator = new CurvatureEstimator();
  supports(context: RecoveryContext): boolean { return context.diagnosis.curvature !== "none" && ["robust", "industrial", "dpm-experimental"].includes(context.profile); }
  estimateCost(context: RecoveryContext): number { return context.framePixels; }
  async run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]> {
    const estimate = this.estimator.estimate(context); const source = asRgba(frame); const width = frame.width; const height = frame.height; const center = (width - 1) / 2; const half = Math.max(1, center); const forward = (value: number) => value * (1 - estimate.strength * (1 - value * value));
    const toOriginal = (point: { x: number; y: number }) => ({ x: center + forward((point.x - center) / half) * half, y: point.y });
    const fromOriginal = (point: { x: number; y: number }) => ({ x: center + inverseCubic((point.x - center) / half, estimate.strength) * half, y: point.y });
    const transformed = curvedRecoveryTransform(toOriginal, fromOriginal); const output = new Uint8ClampedArray(source.length);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) writeSample(output, (y * width + x) * 4, source, width, height, toOriginal({ x, y }).x, y);
    const candidate = createRecoveryCandidate(frame, this.id, output, width, height, transformed, context.memory, "warp", ["mild-cylindrical-strip-warp", `curvature:${estimate.strength.toFixed(3)}`]) as CurvedBarcodeCandidate;
    candidate.curvature = estimate;
    return [candidate];
  }
}

export class SmallModuleRecoveryRoute implements RecoveryRoute {
  readonly id = "small-module" as const;
  supports(context: RecoveryContext): boolean { return context.diagnosis.smallModule !== "none" || (context.diagnosis.evidence.estimatedPixelsPerModule ?? 99) < 5 || context.candidateRegions.some((region) => region.difficultyHints.includes("small-module")); }
  estimateCost(context: RecoveryContext): number { return context.framePixels * 3; }
  async run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]> {
    const pixelsPerModule = context.diagnosis.evidence.estimatedPixelsPerModule ?? 4; const factor = Math.max(1.25, Math.min(3, 5 / Math.max(0.5, pixelsPerModule))); const full = asRgba(frame);
    const region = estimateInkRegion(full, frame.width, frame.height); const cropped = extractRegion(full, frame.width, frame.height, region);
    const cropTransform = affineRecoveryTransform("crop", (point) => ({ x: point.x + region.x, y: point.y + region.y }), (point) => ({ x: point.x - region.x, y: point.y - region.y }));
    const resized = resizeBilinear(cropped, region.width, region.height, factor); const transform = composeRecoveryTransforms(resized.transform, cropTransform);
    const results: RecoveryCandidate[] = [createRecoveryCandidate(frame, this.id, unsharpMask(resized.data, resized.width, resized.height, 0.7), resized.width, resized.height, transform, context.memory, "normalized", [`pixels-per-module:${pixelsPerModule.toFixed(2)}`, `ink-crop:${region.width}x${region.height}`, "bounded-bilinear-resize", "selective-sharpen"])];
    if (canAdd(context, results)) { const nearest = resizeNearest(cropped, region.width, region.height, factor); results.push(createRecoveryCandidate(frame, this.id, nearest.data, nearest.width, nearest.height, composeRecoveryTransforms(nearest.transform, cropTransform), context.memory, "normalized", ["bounded-nearest-resize"])); }
    return results;
  }
}

export class DamagedRecoveryRoute implements RecoveryRoute {
  readonly id = "damaged" as const;
  supports(context: RecoveryContext): boolean { return context.diagnosis.printingDamage !== "none" || context.diagnosis.occlusion !== "none" || (context.diagnosis.evidence.damageScore ?? 0) > 0.1; }
  estimateCost(context: RecoveryContext): number { return context.framePixels; }
  async run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]> {
    const source = asRgba(frame);
    const results: RecoveryCandidate[] = [createRecoveryCandidate(frame, this.id, morphologicalOpen(source, frame.width, frame.height), frame.width, frame.height, identity(), context.memory, "binary", ["bounded-morphological-open", "light-erosion-repair", "decoder-ecc-left-as-authority"])];
    if (canAdd(context, results)) results.push(createRecoveryCandidate(frame, this.id, morphologicalClose(source, frame.width, frame.height), frame.width, frame.height, identity(), context.memory, "binary", ["bounded-morphological-close", "dark-contamination-repair", "decoder-ecc-left-as-authority"]));
    return results;
  }
}

export class QuietZoneRecoveryRoute implements RecoveryRoute {
  readonly id = "quiet-zone" as const;
  supports(context: RecoveryContext): boolean { return (context.diagnosis.evidence.busyBorderRatio ?? 0) > 0.2 && ["industrial", "dpm-experimental"].includes(context.profile); }
  estimateCost(context: RecoveryContext): number { return context.framePixels; }
  async run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]> {
    const padding = Math.max(4, Math.min(64, Math.round(Math.min(frame.width, frame.height) * 0.12))); const result = padNeutral(asRgba(frame), frame.width, frame.height, padding);
    return [createRecoveryCandidate(frame, this.id, result.data, result.width, result.height, result.transform, context.memory, "candidate", ["synthetic-neutral-border", "data-region-unchanged"])];
  }
}

export class ScreenRecoveryRoute implements RecoveryRoute {
  readonly id = "screen" as const;
  supports(context: RecoveryContext): boolean { return context.diagnosis.screenMoiré !== undefined && context.diagnosis.screenMoiré !== "none" && ["industrial", "dpm-experimental"].includes(context.profile); }
  estimateCost(context: RecoveryContext): number { return context.framePixels; }
  async run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]> {
    const source = asRgba(frame); const smoothed = localContrastNormalize(source, frame.width, frame.height);
    return [createRecoveryCandidate(frame, this.id, adaptiveThreshold(smoothed, frame.width, frame.height, 5, 2), frame.width, frame.height, identity(), context.memory, "binary", ["screen-local-normalization", "bounded-moire-threshold"])];
  }
}

export class DpmExperimentalRecoveryRoute implements RecoveryRoute {
  readonly id = "dpm" as const;
  supports(context: RecoveryContext): boolean { return context.dpmExperimentalEnabled && (context.diagnosis.dpmLikelihood ?? 0) >= 0.35; }
  estimateCost(context: RecoveryContext): number { return context.framePixels; }
  async run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]> {
    const gradient = morphologicalGradient(asRgba(frame), frame.width, frame.height);
    return [createRecoveryCandidate(frame, this.id, adaptiveThreshold(gradient, frame.width, frame.height, 4, 1), frame.width, frame.height, identity(), context.memory, "binary", ["experimental-dpm", "morphological-gradient", "bounded-dot-contrast"])];
  }
}

export class GeneralRecoveryRoute implements RecoveryRoute {
  readonly id = "general" as const;
  supports(): boolean { return true; }
  estimateCost(context: RecoveryContext): number { return context.framePixels; }
  async run(frame: NormalizedFrame): Promise<RecoveryCandidate[]> { return [originalRecoveryCandidate(frame)]; }
}

export function registerDefaultRecoveryRoutes(registry = new RecoveryRouteRegistry()): RecoveryRouteRegistry {
  for (const route of [new LowContrastRecoveryRoute(), new IlluminationRecoveryRoute(), new BlurRecoveryRoute(), new GlareRecoveryRoute(), new PerspectiveRecoveryRoute(), new CurvedRecoveryRoute(), new SmallModuleRecoveryRoute(), new DamagedRecoveryRoute(), new QuietZoneRecoveryRoute(), new ScreenRecoveryRoute(), new DpmExperimentalRecoveryRoute(), new GeneralRecoveryRoute()]) registry.register(route);
  return registry;
}

function identity() { return { kind: "identity" as const, forward: (point: { x: number; y: number }) => ({ ...point }), inverse: (point: { x: number; y: number }) => ({ ...point }) }; }
function canAdd(context: RecoveryContext, results: readonly RecoveryCandidate[]): boolean { return results.length < (context.budget.maximumCandidates ?? context.budget.maximumAttempts); }
type Point = { x: number; y: number };
function estimateQuadrilateral(region: { x: number; y: number; width: number; height: number }, score: number): [Point, Point, Point, Point] {
  const skew = Math.min(0.36, Math.max(0.02, score * 0.32)); const inset = Math.max(1, Math.min(region.width, region.height) * 0.04);
  return [{ x: region.x + inset + region.width * skew, y: region.y + inset }, { x: region.x + region.width - inset - region.width * skew * 0.5, y: region.y + inset * 0.4 }, { x: region.x + region.width - inset - region.width * skew, y: region.y + region.height - inset }, { x: region.x + inset + region.width * skew * 0.5, y: region.y + region.height - inset * 0.4 }];
}
function solveHomography(source: readonly Point[], destination: readonly Point[]): number[] {
  const matrix: number[][] = []; const vector: number[] = [];
  for (let index = 0; index < 4; index += 1) {
    const { x, y } = source[index]; const u = destination[index].x; const v = destination[index].y;
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); vector.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]); vector.push(v);
  }
  const solution = gaussianSolve(matrix, vector); return [solution[0], solution[1], solution[2], solution[3], solution[4], solution[5], solution[6], solution[7], 1];
}
function gaussianSolve(matrix: number[][], vector: number[]): number[] {
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < 8; column += 1) { let pivot = column; for (let row = column + 1; row < 8; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row; if (Math.abs(augmented[pivot][column]) < 1e-9) throw new Error("Perspective quadrilateral is degenerate."); [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]]; const divisor = augmented[column][column]; for (let k = column; k <= 8; k += 1) augmented[column][k] /= divisor; for (let row = 0; row < 8; row += 1) if (row !== column) { const factor = augmented[row][column]; for (let k = column; k <= 8; k += 1) augmented[row][k] -= factor * augmented[column][k]; } }
  return augmented.map((row) => row[8]);
}
function project(matrix: readonly number[], point: Point): Point { const denominator = matrix[6] * point.x + matrix[7] * point.y + matrix[8]; return { x: (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / denominator, y: (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / denominator }; }
function pointTuple(point: Point): [number, number] { return [point.x, point.y]; }
function inverseCubic(target: number, strength: number): number { let low = -1; let high = 1; for (let iteration = 0; iteration < 16; iteration += 1) { const middle = (low + high) / 2; const value = middle * (1 - strength * (1 - middle * middle)); if (value < target) low = middle; else high = middle; } return (low + high) / 2; }
function clampInt(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, Math.floor(value))); }
function estimateInkRegion(data: Uint8ClampedArray, width: number, height: number): { x: number; y: number; width: number; height: number } {
  let left = width; let top = height; let right = -1; let bottom = -1;
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) { const index = (y * width + x) * 4; const luminance = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722; if (luminance < 180) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); } }
  if (right < left || bottom < top) return { x: 0, y: 0, width, height };
  const padX = Math.max(2, Math.round((right - left + 1) * 0.12)); const padY = Math.max(2, Math.round((bottom - top + 1) * 0.12)); const x = Math.max(0, left - padX); const y = Math.max(0, top - padY);
  return { x, y, width: Math.min(width - x, right - left + 1 + padX * 2), height: Math.min(height - y, bottom - top + 1 + padY * 2) };
}
function extractRegion(data: Uint8ClampedArray, width: number, height: number, region: { x: number; y: number; width: number; height: number }): Uint8ClampedArray {
  const output = new Uint8ClampedArray(region.width * region.height * 4); for (let y = 0; y < region.height; y += 1) { const sourceStart = ((region.y + y) * width + region.x) * 4; output.set(data.subarray(sourceStart, sourceStart + region.width * 4), y * region.width * 4); } void height; return output;
}
