import type { CropPadding, PixelBuffer, ScaleLabel, ScoredRegion } from "./types.js";
import { type CoordinateTransform } from "./geometry.js";
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
}
/** Nearest-neighbor resize for RGBA buffers. */
export declare function resizeBuffer(src: PixelBuffer, targetW: number, targetH: number, budget?: ExecutionBudget): PixelBuffer;
export declare function fitMaxSide(src: PixelBuffer, maxSide: number, budget?: ExecutionBudget): {
    buffer: PixelBuffer;
    scale: number;
};
/** Conservative high-frequency rejection for independently random pixels. */
export declare function isPathologicalHighEntropy(image: PixelBuffer, budget?: ExecutionBudget): boolean;
/**
 * Prioritized candidates:
 * - top regions get full padding×scale combos
 * - later regions get medium@1 first
 * - full-image fallbacks last
 */
export declare function generateCandidates(full: PixelBuffer, options: {
    previewSize: number;
    maxCandidates: number;
    paddings: CropPadding[];
    scales: number[];
    maxPixels: number;
    enableLocalization?: boolean;
    enableFullImageFallback?: boolean;
    enableSplitImageFallback?: boolean;
    budget?: ExecutionBudget;
    sourceToFrame?: CoordinateTransform;
}): CandidateImage[];
//# sourceMappingURL=candidate-generation.d.ts.map