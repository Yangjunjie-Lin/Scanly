import type { CornerPoint } from "../contracts/result.js";
import type { RecoveryCoordinateTransform } from "./types.js";

export function identityRecoveryTransform(): RecoveryCoordinateTransform {
  return { kind: "identity", forward: copy, inverse: copy };
}

export function affineRecoveryTransform(
  kind: "crop" | "resize" | "padding",
  toOriginal: (point: CornerPoint) => CornerPoint,
  fromOriginal: (point: CornerPoint) => CornerPoint,
): RecoveryCoordinateTransform {
  return { kind, forward: toOriginal, inverse: fromOriginal };
}

export function projectiveRecoveryTransform(
  candidateToOriginal: readonly number[],
  originalToCandidate: readonly number[],
): RecoveryCoordinateTransform {
  if (candidateToOriginal.length !== 9 || originalToCandidate.length !== 9) throw new RangeError("Projective transforms require 3x3 matrices.");
  return {
    kind: "perspective",
    forward: (point) => project(candidateToOriginal, point),
    inverse: (point) => project(originalToCandidate, point),
  };
}

export function curvedRecoveryTransform(
  toOriginal: (point: CornerPoint) => CornerPoint,
  fromOriginal: (point: CornerPoint) => CornerPoint,
): RecoveryCoordinateTransform {
  return { kind: "curved", forward: toOriginal, inverse: fromOriginal };
}

export function composeRecoveryTransforms(
  inner: RecoveryCoordinateTransform,
  outer: RecoveryCoordinateTransform,
): RecoveryCoordinateTransform {
  return {
    kind: "composed",
    forward: (point) => outer.forward(inner.forward(point)),
    inverse: (point) => inner.inverse(outer.inverse(point)),
  };
}

export function mapRecoveryGeometry(points: readonly CornerPoint[] | undefined, transform: RecoveryCoordinateTransform): CornerPoint[] | undefined {
  if (!points || points.length < 3) return undefined;
  const mapped = points.map((point) => transform.forward(point));
  return mapped.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)) ? mapped : undefined;
}

function project(matrix: readonly number[], point: CornerPoint): CornerPoint {
  const denominator = matrix[6] * point.x + matrix[7] * point.y + matrix[8];
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-9) return { x: Number.NaN, y: Number.NaN };
  return {
    x: (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / denominator,
    y: (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / denominator,
  };
}

function copy(point: CornerPoint): CornerPoint { return { x: point.x, y: point.y }; }
