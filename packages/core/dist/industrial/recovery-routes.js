import { curvedRecoveryTransform, projectiveRecoveryTransform } from "./coordinate-transform.js";
import { RecoveryRouteRegistry } from "./recovery-route-registry.js";
import { adaptiveThreshold, asRgba, claheLike, createRecoveryCandidate, glareAlternative, illuminationNormalize, localContrastNormalize, morphologicalClose, morphologicalGradient, originalRecoveryCandidate, padNeutral, resizeBilinear, resizeNearest, unsharpMask, writeSample } from "./pixels.js";
export class LowContrastRecoveryRoute {
    id = "low-contrast";
    supports(context) { return context.diagnosis.lowContrast !== "none" || context.diagnosis.underexposure !== "none" || context.diagnosis.overexposure !== "none"; }
    estimateCost(context) { return context.framePixels * Math.min(3, context.budget.maximumCandidates ?? 2); }
    async run(frame, context) {
        const data = asRgba(frame);
        const results = [];
        if (canAdd(context, results))
            results.push(createRecoveryCandidate(frame, this.id, localContrastNormalize(data, frame.width, frame.height), frame.width, frame.height, identity(), context.memory, "normalized", ["local-contrast-normalization"]));
        if (canAdd(context, results))
            results.push(createRecoveryCandidate(frame, this.id, claheLike(data, frame.width, frame.height), frame.width, frame.height, identity(), context.memory, "grayscale", ["clahe-like-clipped-local-contrast"]));
        if (canAdd(context, results))
            results.push(createRecoveryCandidate(frame, this.id, adaptiveThreshold(data, frame.width, frame.height), frame.width, frame.height, identity(), context.memory, "binary", ["adaptive-threshold"]));
        return results;
    }
}
export class IlluminationRecoveryRoute {
    id = "illumination";
    supports(context) { return (context.diagnosis.evidence.illuminationVariation ?? 0) > 0.12 || context.diagnosis.underexposure !== "none" || context.diagnosis.overexposure !== "none"; }
    estimateCost(context) { return context.framePixels; }
    async run(frame, context) {
        return [createRecoveryCandidate(frame, this.id, illuminationNormalize(asRgba(frame), frame.width, frame.height), frame.width, frame.height, identity(), context.memory, "normalized", ["local-background-illumination-estimate", "illumination-normalize"])];
    }
}
export class BlurRecoveryRoute {
    id = "blur";
    supports(context) { return context.diagnosis.blur !== "none" || context.diagnosis.motionBlur !== "none"; }
    estimateCost(context) { return context.framePixels; }
    async run(frame, context) {
        const data = asRgba(frame);
        const direction = context.diagnosis.motionBlur !== "none" ? (context.diagnosis.evidence.anisotropy > 0.32 ? "horizontal" : "vertical") : "both";
        return [createRecoveryCandidate(frame, this.id, unsharpMask(data, frame.width, frame.height, 1.1, direction), frame.width, frame.height, identity(), context.memory, "normalized", ["diagnosed-blur", `direction-aware-${direction}-unsharp-mask`])];
    }
}
export class GlareRecoveryRoute {
    id = "glare";
    supports(context) { return context.diagnosis.glare !== "none"; }
    estimateCost(context) { return context.framePixels; }
    async run(frame, context) {
        const result = glareAlternative(asRgba(frame), frame.width, frame.height);
        if (result.glareRatio >= 0.45)
            return [];
        return [createRecoveryCandidate(frame, this.id, result.data, frame.width, frame.height, identity(), context.memory, "binary", ["saturated-region-mask", "alternate-threshold", "glare-not-dominated"])];
    }
}
export class PerspectiveRecoveryRoute {
    id = "perspective";
    supports(context) { return context.diagnosis.perspectiveDistortion !== "none"; }
    estimateCost(context) { return Math.min(context.budget.maximumRectifiedArea ?? context.framePixels, context.framePixels); }
    async run(frame, context) {
        if ((context.budget.maximumPerspectiveTransforms ?? 1) < 1)
            return [];
        const region = context.candidateRegions[0]?.boundingBox ?? { x: 0, y: 0, width: frame.width, height: frame.height };
        const quad = estimateQuadrilateral(region, context.diagnosis.evidence.perspectiveScore ?? 0);
        const area = Math.max(1, region.width * region.height);
        const ratio = region.width / Math.max(1, region.height);
        const targetWidth = clampInt(Math.sqrt(area * ratio), 32, 1_024);
        const targetHeight = clampInt(Math.sqrt(area / Math.max(0.01, ratio)), 32, 1_024);
        if (targetWidth * targetHeight > (context.budget.maximumRectifiedArea ?? Number.MAX_SAFE_INTEGER))
            return [];
        const destination = [{ x: 0, y: 0 }, { x: targetWidth - 1, y: 0 }, { x: targetWidth - 1, y: targetHeight - 1 }, { x: 0, y: targetHeight - 1 }];
        const sourceToDestination = solveHomography(quad, destination);
        const destinationToSource = solveHomography(destination, quad);
        const data = asRgba(frame);
        const rectified = new Uint8ClampedArray(targetWidth * targetHeight * 4);
        for (let y = 0; y < targetHeight; y += 1)
            for (let x = 0; x < targetWidth; x += 1)
                writeSample(rectified, (y * targetWidth + x) * 4, data, frame.width, frame.height, ...pointTuple(project(destinationToSource, { x, y })));
        return [createRecoveryCandidate(frame, this.id, rectified, targetWidth, targetHeight, projectiveRecoveryTransform(destinationToSource, sourceToDestination), context.memory, "rectified", ["quadrilateral-estimate", "bounded-homography", `rectified-area:${targetWidth * targetHeight}`])];
    }
}
export class CurvatureEstimator {
    estimate(context) {
        const score = context.diagnosis.evidence.curvatureScore ?? 0;
        return { strength: Math.max(0.04, Math.min(0.28, score * 0.22)), confidence: Math.min(1, score), direction: "horizontal" };
    }
}
export class CurvedRecoveryRoute {
    id = "curved";
    estimator = new CurvatureEstimator();
    supports(context) { return context.diagnosis.curvature === "medium" || context.diagnosis.curvature === "high"; }
    estimateCost(context) { return context.framePixels; }
    async run(frame, context) {
        const estimate = this.estimator.estimate(context);
        const source = asRgba(frame);
        const width = frame.width;
        const height = frame.height;
        const center = (width - 1) / 2;
        const half = Math.max(1, center);
        const forward = (value) => value * (1 - estimate.strength * (1 - value * value));
        const toOriginal = (point) => ({ x: center + forward((point.x - center) / half) * half, y: point.y });
        const fromOriginal = (point) => ({ x: center + inverseCubic((point.x - center) / half, estimate.strength) * half, y: point.y });
        const transformed = curvedRecoveryTransform(toOriginal, fromOriginal);
        const output = new Uint8ClampedArray(source.length);
        for (let y = 0; y < height; y += 1)
            for (let x = 0; x < width; x += 1)
                writeSample(output, (y * width + x) * 4, source, width, height, toOriginal({ x, y }).x, y);
        const candidate = createRecoveryCandidate(frame, this.id, output, width, height, transformed, context.memory, "warp", ["mild-cylindrical-strip-warp", `curvature:${estimate.strength.toFixed(3)}`]);
        candidate.curvature = estimate;
        return [candidate];
    }
}
export class SmallModuleRecoveryRoute {
    id = "small-module";
    supports(context) { return context.diagnosis.smallModule !== "none"; }
    estimateCost(context) { return context.framePixels * 3; }
    async run(frame, context) {
        const module = context.diagnosis.evidence.estimatedPixelsPerModule ?? 4;
        const factor = Math.max(1.25, Math.min(3, 5 / Math.max(0.5, module)));
        const source = asRgba(frame);
        const resized = resizeBilinear(source, frame.width, frame.height, factor);
        const results = [createRecoveryCandidate(frame, this.id, unsharpMask(resized.data, resized.width, resized.height, 0.7), resized.width, resized.height, resized.transform, context.memory, "normalized", [`pixels-per-module:${module.toFixed(2)}`, "bounded-bilinear-resize", "selective-sharpen"])];
        if (canAdd(context, results)) {
            const nearest = resizeNearest(source, frame.width, frame.height, factor);
            results.push(createRecoveryCandidate(frame, this.id, nearest.data, nearest.width, nearest.height, nearest.transform, context.memory, "normalized", ["bounded-nearest-resize"]));
        }
        return results;
    }
}
export class DamagedRecoveryRoute {
    id = "damaged";
    supports(context) { return context.diagnosis.printingDamage !== "none" || context.diagnosis.occlusion !== "none"; }
    estimateCost(context) { return context.framePixels; }
    async run(frame, context) {
        return [createRecoveryCandidate(frame, this.id, morphologicalClose(asRgba(frame), frame.width, frame.height), frame.width, frame.height, identity(), context.memory, "binary", ["bounded-morphological-close", "decoder-ecc-left-as-authority"])];
    }
}
export class QuietZoneRecoveryRoute {
    id = "quiet-zone";
    supports(context) { return (context.diagnosis.evidence.busyBorderRatio ?? 0) > 0.2; }
    estimateCost(context) { return context.framePixels; }
    async run(frame, context) {
        const padding = Math.max(2, Math.min(32, Math.round(Math.min(frame.width, frame.height) * 0.04)));
        const result = padNeutral(asRgba(frame), frame.width, frame.height, padding);
        return [createRecoveryCandidate(frame, this.id, result.data, result.width, result.height, result.transform, context.memory, "candidate", ["synthetic-neutral-border", "data-region-unchanged"])];
    }
}
export class ScreenRecoveryRoute {
    id = "screen";
    supports(context) { return context.diagnosis.screenMoiré !== undefined && context.diagnosis.screenMoiré !== "none"; }
    estimateCost(context) { return context.framePixels; }
    async run(frame, context) {
        const source = asRgba(frame);
        const smoothed = localContrastNormalize(source, frame.width, frame.height);
        return [createRecoveryCandidate(frame, this.id, adaptiveThreshold(smoothed, frame.width, frame.height, 5, 2), frame.width, frame.height, identity(), context.memory, "binary", ["screen-local-normalization", "bounded-moire-threshold"])];
    }
}
export class DpmExperimentalRecoveryRoute {
    id = "dpm";
    supports(context) { return context.dpmExperimentalEnabled && (context.diagnosis.dpmLikelihood ?? 0) >= 0.35; }
    estimateCost(context) { return context.framePixels; }
    async run(frame, context) {
        const gradient = morphologicalGradient(asRgba(frame), frame.width, frame.height);
        return [createRecoveryCandidate(frame, this.id, adaptiveThreshold(gradient, frame.width, frame.height, 4, 1), frame.width, frame.height, identity(), context.memory, "binary", ["experimental-dpm", "morphological-gradient", "bounded-dot-contrast"])];
    }
}
export class GeneralRecoveryRoute {
    id = "general";
    supports() { return true; }
    estimateCost(context) { return context.framePixels; }
    async run(frame) { return [originalRecoveryCandidate(frame)]; }
}
export function registerDefaultRecoveryRoutes(registry = new RecoveryRouteRegistry()) {
    for (const route of [new LowContrastRecoveryRoute(), new IlluminationRecoveryRoute(), new BlurRecoveryRoute(), new GlareRecoveryRoute(), new PerspectiveRecoveryRoute(), new CurvedRecoveryRoute(), new SmallModuleRecoveryRoute(), new DamagedRecoveryRoute(), new QuietZoneRecoveryRoute(), new ScreenRecoveryRoute(), new DpmExperimentalRecoveryRoute(), new GeneralRecoveryRoute()])
        registry.register(route);
    return registry;
}
function identity() { return { kind: "identity", forward: (point) => ({ ...point }), inverse: (point) => ({ ...point }) }; }
function canAdd(context, results) { return results.length < (context.budget.maximumCandidates ?? context.budget.maximumAttempts); }
function estimateQuadrilateral(region, score) {
    const skew = Math.min(0.22, Math.max(0.015, score * 0.2));
    const inset = Math.max(1, Math.min(region.width, region.height) * 0.04);
    return [{ x: region.x + inset + region.width * skew, y: region.y + inset }, { x: region.x + region.width - inset - region.width * skew * 0.5, y: region.y + inset * 0.4 }, { x: region.x + region.width - inset - region.width * skew, y: region.y + region.height - inset }, { x: region.x + inset + region.width * skew * 0.5, y: region.y + region.height - inset * 0.4 }];
}
function solveHomography(source, destination) {
    const matrix = [];
    const vector = [];
    for (let index = 0; index < 4; index += 1) {
        const { x, y } = source[index];
        const u = destination[index].x;
        const v = destination[index].y;
        matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
        vector.push(u);
        matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
        vector.push(v);
    }
    const solution = gaussianSolve(matrix, vector);
    return [solution[0], solution[1], solution[2], solution[3], solution[4], solution[5], solution[6], solution[7], 1];
}
function gaussianSolve(matrix, vector) {
    const augmented = matrix.map((row, index) => [...row, vector[index]]);
    for (let column = 0; column < 8; column += 1) {
        let pivot = column;
        for (let row = column + 1; row < 8; row += 1)
            if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column]))
                pivot = row;
        if (Math.abs(augmented[pivot][column]) < 1e-9)
            throw new Error("Perspective quadrilateral is degenerate.");
        [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
        const divisor = augmented[column][column];
        for (let k = column; k <= 8; k += 1)
            augmented[column][k] /= divisor;
        for (let row = 0; row < 8; row += 1)
            if (row !== column) {
                const factor = augmented[row][column];
                for (let k = column; k <= 8; k += 1)
                    augmented[row][k] -= factor * augmented[column][k];
            }
    }
    return augmented.map((row) => row[8]);
}
function project(matrix, point) { const denominator = matrix[6] * point.x + matrix[7] * point.y + matrix[8]; return { x: (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / denominator, y: (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / denominator }; }
function pointTuple(point) { return [point.x, point.y]; }
function inverseCubic(target, strength) { let low = -1; let high = 1; for (let iteration = 0; iteration < 16; iteration += 1) {
    const middle = (low + high) / 2;
    const value = middle * (1 - strength * (1 - middle * middle));
    if (value < target)
        low = middle;
    else
        high = middle;
} return (low + high) / 2; }
function clampInt(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, Math.floor(value))); }
//# sourceMappingURL=recovery-routes.js.map