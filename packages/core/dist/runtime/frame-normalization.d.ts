import type { FrameOrientation } from "../contracts/frame.js";
import type { PixelBuffer } from "../qr/types.js";
import { type CoordinateTransform, type Matrix3x3 } from "../qr/geometry.js";
import type { ExecutionBudget } from "./execution-budget.js";
export interface OrientationNormalization {
    buffer: PixelBuffer;
    sourceToUpright: CoordinateTransform;
    sourceOrientation: FrameOrientation;
}
export declare function sourceToUprightMatrix(orientation: FrameOrientation, width: number, height: number): Matrix3x3;
/** Converts source-buffer pixels to canonical upright RGBA coordinates. */
export declare function normalizeRgbaOrientation(buffer: PixelBuffer, orientation: FrameOrientation, budget?: ExecutionBudget): OrientationNormalization;
//# sourceMappingURL=frame-normalization.d.ts.map