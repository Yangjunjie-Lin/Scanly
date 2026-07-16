import type { FrameOrientation } from "../contracts/frame.js";
import type { PixelBuffer } from "../qr/types.js";
import { createCoordinateTransform, IDENTITY_MATRIX, type CoordinateTransform, type Matrix3x3 } from "../qr/geometry.js";
import { rotateBuffer } from "../qr/rotate.js";
import type { ExecutionBudget } from "./execution-budget.js";

export interface OrientationNormalization {
  buffer: PixelBuffer;
  sourceToUpright: CoordinateTransform;
  sourceOrientation: FrameOrientation;
}

export function sourceToUprightMatrix(orientation: FrameOrientation, width: number, height: number): Matrix3x3 {
  if (orientation === 90) return [0, -1, height - 1, 1, 0, 0, 0, 0, 1];
  if (orientation === 180) return [-1, 0, width - 1, 0, -1, height - 1, 0, 0, 1];
  if (orientation === 270) return [0, 1, 0, -1, 0, width - 1, 0, 0, 1];
  return IDENTITY_MATRIX;
}

/** Converts source-buffer pixels to canonical upright RGBA coordinates. */
export function normalizeRgbaOrientation(buffer: PixelBuffer, orientation: FrameOrientation, budget?: ExecutionBudget): OrientationNormalization {
  const upright = orientation === 0 ? buffer : rotateBuffer(buffer, orientation, budget);
  return {
    buffer: upright,
    sourceOrientation: orientation,
    sourceToUpright: createCoordinateTransform(
      sourceToUprightMatrix(orientation, buffer.width, buffer.height),
      buffer.width,
      buffer.height,
      upright.width,
      upright.height,
    ),
  };
}
