import type { CornerPoint } from "../contracts/result.js";
import type { Rect, RotationDegrees } from "./types.js";
export type Matrix3x3 = readonly [number, number, number, number, number, number, number, number, number];
export declare const IDENTITY_MATRIX: Matrix3x3;
export interface CoordinateTransform {
    readonly matrix: Matrix3x3;
    readonly inverseMatrix: Matrix3x3;
    readonly sourceWidth: number;
    readonly sourceHeight: number;
    readonly targetWidth: number;
    readonly targetHeight: number;
    forward(point: CornerPoint): CornerPoint;
    inverse(point: CornerPoint): CornerPoint;
}
export declare function applyMatrix(matrix: Matrix3x3, point: CornerPoint): CornerPoint;
export declare function multiplyMatrices(left: Matrix3x3, right: Matrix3x3): Matrix3x3;
export declare function invertMatrix(matrix: Matrix3x3): Matrix3x3;
export declare function createCoordinateTransform(matrix: Matrix3x3, sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): CoordinateTransform;
/** Maps pixels from a resized crop buffer into its source image. */
export declare function cropToSourceTransform(crop: Rect, candidateWidth: number, candidateHeight: number, sourceWidth: number, sourceHeight: number): CoordinateTransform;
/** Maps points returned from a clockwise-rotated buffer back into the pre-rotation buffer. */
export declare function rotatedToSourceMatrix(rotation: RotationDegrees, sourceWidth: number, sourceHeight: number): Matrix3x3;
export declare function mapAndClampPoints(points: readonly CornerPoint[], matrix: Matrix3x3, frameWidth: number, frameHeight: number): CornerPoint[] | undefined;
//# sourceMappingURL=geometry.d.ts.map