import type { PixelBuffer } from "./types.js";
import type { ExecutionBudget } from "../runtime/execution-budget.js";
/** Convert RGBA buffer to grayscale in-place copy (R=G=B). */
export declare function toGrayscale(src: PixelBuffer, budget?: ExecutionBudget): PixelBuffer;
/** Sample luminance at pixel index. */
export declare function luminanceAt(data: Uint8ClampedArray, i: number): number;
/** Build a PixelBuffer from raw RGBA. */
export declare function createPixelBuffer(data: Uint8ClampedArray | Uint8Array, width: number, height: number): PixelBuffer;
/** Flatten semi-transparent pixels onto white (QR decoders expect opaque RGB). */
export declare function flattenAlphaOntoWhite(src: PixelBuffer): PixelBuffer;
/** Deep clone a pixel buffer. */
export declare function cloneBuffer(src: PixelBuffer): PixelBuffer;
//# sourceMappingURL=grayscale.d.ts.map