import type { CornerPoint } from "../contracts/result.js";
import type { Rect, RotationDegrees } from "./types.js";

export type Matrix3x3 = readonly [number, number, number, number, number, number, number, number, number];
export const IDENTITY_MATRIX: Matrix3x3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

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

export function applyMatrix(matrix: Matrix3x3, point: CornerPoint): CornerPoint {
  const denominator = matrix[6] * point.x + matrix[7] * point.y + matrix[8];
  return {
    x: (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / denominator,
    y: (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / denominator,
  };
}

export function multiplyMatrices(left: Matrix3x3, right: Matrix3x3): Matrix3x3 {
  const out = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      for (let k = 0; k < 3; k++) out[row * 3 + column] += left[row * 3 + k] * right[k * 3 + column];
    }
  }
  return out as unknown as Matrix3x3;
}

export function invertMatrix(matrix: Matrix3x3): Matrix3x3 {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(determinant) < 1e-12) throw new Error("Coordinate transform is not invertible.");
  return [
    (e * i - f * h) / determinant, (c * h - b * i) / determinant, (b * f - c * e) / determinant,
    (f * g - d * i) / determinant, (a * i - c * g) / determinant, (c * d - a * f) / determinant,
    (d * h - e * g) / determinant, (b * g - a * h) / determinant, (a * e - b * d) / determinant,
  ];
}

export function createCoordinateTransform(
  matrix: Matrix3x3,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): CoordinateTransform {
  const inverseMatrix = invertMatrix(matrix);
  return {
    matrix, inverseMatrix, sourceWidth, sourceHeight, targetWidth, targetHeight,
    forward: (point) => applyMatrix(matrix, point),
    inverse: (point) => applyMatrix(inverseMatrix, point),
  };
}

/** Maps pixels from a resized crop buffer into its source image. */
export function cropToSourceTransform(crop: Rect, candidateWidth: number, candidateHeight: number, sourceWidth: number, sourceHeight: number): CoordinateTransform {
  return createCoordinateTransform(
    [crop.width / candidateWidth, 0, crop.x, 0, crop.height / candidateHeight, crop.y, 0, 0, 1],
    candidateWidth, candidateHeight, sourceWidth, sourceHeight,
  );
}

/** Maps points returned from a clockwise-rotated buffer back into the pre-rotation buffer. */
export function rotatedToSourceMatrix(rotation: RotationDegrees, sourceWidth: number, sourceHeight: number): Matrix3x3 {
  if (rotation === 90) return [0, 1, 0, -1, 0, sourceHeight - 1, 0, 0, 1];
  if (rotation === 180) return [-1, 0, sourceWidth - 1, 0, -1, sourceHeight - 1, 0, 0, 1];
  if (rotation === 270) return [0, -1, sourceWidth - 1, 1, 0, 0, 0, 0, 1];
  return IDENTITY_MATRIX;
}

export function mapAndClampPoints(points: readonly CornerPoint[], matrix: Matrix3x3, frameWidth: number, frameHeight: number): CornerPoint[] | undefined {
  if (points.length < 3 || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return undefined;
  const tolerance = Math.max(frameWidth, frameHeight) * 0.05 + 2;
  const mapped = points.map((point) => applyMatrix(matrix, point));
  if (mapped.some((point) => point.x < -tolerance || point.y < -tolerance || point.x > frameWidth - 1 + tolerance || point.y > frameHeight - 1 + tolerance)) return undefined;
  return mapped.map((point) => ({
    x: Math.max(0, Math.min(frameWidth - 1, point.x)),
    y: Math.max(0, Math.min(frameHeight - 1, point.y)),
  }));
}
