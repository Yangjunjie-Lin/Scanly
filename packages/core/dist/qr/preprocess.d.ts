import type { PixelBuffer, PreprocessMethod } from "./types.js";
/** Min-max contrast stretch on grayscale luminance. */
export declare function contrastStretch(src: PixelBuffer): PixelBuffer;
/** Gamma correction on grayscale (gamma < 1 brightens midtones). */
export declare function gammaCorrect(src: PixelBuffer, gamma?: number): PixelBuffer;
/** Invert RGB channels (keeps alpha). */
export declare function invertColors(src: PixelBuffer): PixelBuffer;
/** Fixed threshold binarization. */
export declare function fixedThreshold(src: PixelBuffer, threshold: number): PixelBuffer;
/** Otsu automatic threshold. Returns threshold value 0–255. */
export declare function computeOtsuThreshold(src: PixelBuffer): number;
export declare function otsuThreshold(src: PixelBuffer): PixelBuffer;
/** Lightweight 3x3 sharpen kernel on grayscale. */
export declare function sharpen(src: PixelBuffer): PixelBuffer;
/** Apply a named preprocessing method. */
export declare function applyPreprocess(src: PixelBuffer, method: PreprocessMethod): PixelBuffer;
//# sourceMappingURL=preprocess.d.ts.map