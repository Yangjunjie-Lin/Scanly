import type { CropPadding, PixelBuffer, Rect, ScoredRegion } from "./types.js";
/** Clamp a rectangle to image bounds. */
export declare function clampRect(rect: Rect, width: number, height: number): Rect;
/** Expand a rect by relative padding, then clamp to bounds (edge-safe). */
export declare function applyCropPadding(rect: Rect, imageWidth: number, imageHeight: number, padding: CropPadding): Rect;
/** Intersection-over-union of two rects. */
export declare function iou(a: Rect, b: Rect): number;
/** Non-maximum suppression for scored regions. */
export declare function nonMaximumSuppression(regions: ScoredRegion[], iouThreshold?: number, maxKeep?: number): ScoredRegion[];
/**
 * Edge-density grid scan returning top-N candidate regions on the preview image.
 * Coordinates are in preview pixel space.
 */
export declare function detectCandidateRegions(image: PixelBuffer, options?: {
    gridSize?: number;
    windowCells?: number;
    maxRaw?: number;
}): ScoredRegion[];
/** Scale a preview-space rect to original image coordinates. */
export declare function scaleRectToOriginal(rect: Rect, previewScale: number): Rect;
/** Crop a region from a pixel buffer. */
export declare function cropBuffer(src: PixelBuffer, rect: Rect): PixelBuffer;
//# sourceMappingURL=region-detection.d.ts.map