import type { CropPadding, PixelBuffer, ScaleLabel, ScoredRegion } from "./types.js";
export interface CandidateImage {
    buffer: PixelBuffer;
    candidateIndex: number;
    candidateScore: number;
    cropPadding: CropPadding | "full";
    scale: ScaleLabel;
    scaleFactor: number;
    region: ScoredRegion | null;
}
/** Nearest-neighbor resize for RGBA buffers. */
export declare function resizeBuffer(src: PixelBuffer, targetW: number, targetH: number): PixelBuffer;
export declare function fitMaxSide(src: PixelBuffer, maxSide: number): {
    buffer: PixelBuffer;
    scale: number;
};
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
}): CandidateImage[];
//# sourceMappingURL=candidate-generation.d.ts.map