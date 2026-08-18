import type { PixelBuffer, PreprocessMethod } from "./types.js";
import type { ExecutionBudget } from "../runtime/execution-budget.js";
/** Min-max contrast stretch on grayscale luminance. */
export declare function contrastStretch(src: PixelBuffer, budget?: ExecutionBudget): PixelBuffer;
/** Gamma correction on grayscale (gamma < 1 brightens midtones). */
export declare function gammaCorrect(src: PixelBuffer, gamma?: number, budget?: ExecutionBudget): PixelBuffer;
/** Invert RGB channels (keeps alpha). */
export declare function invertColors(src: PixelBuffer, budget?: ExecutionBudget): PixelBuffer;
/** Fixed threshold binarization. */
export declare function fixedThreshold(src: PixelBuffer, threshold: number, budget?: ExecutionBudget): PixelBuffer;
/** Otsu automatic threshold. Returns threshold value 0–255. */
export declare function computeOtsuThreshold(src: PixelBuffer, budget?: ExecutionBudget): number;
export declare function otsuThreshold(src: PixelBuffer, budget?: ExecutionBudget): PixelBuffer;
/** Lightweight 3x3 sharpen kernel on grayscale. */
export declare function sharpen(src: PixelBuffer, budget?: ExecutionBudget): PixelBuffer;
/** Apply a named preprocessing method. */
export declare function applyPreprocess(src: PixelBuffer, method: PreprocessMethod, budget?: ExecutionBudget): PixelBuffer;
//# sourceMappingURL=preprocess.d.ts.map