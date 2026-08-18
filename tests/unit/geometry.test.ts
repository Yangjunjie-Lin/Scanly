import { describe, expect, it } from "vitest";
import {
  applyMatrix,
  createCoordinateTransform,
  cropToSourceTransform,
  IDENTITY_MATRIX,
  invertMatrix,
  multiplyMatrices,
  rotatedToSourceMatrix,
} from "@scanly/core/qr";

function close(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 8);
  expect(actual.y).toBeCloseTo(expected.y, 8);
}

describe("coordinate transforms", () => {
  it("round-trips identity, ROI, crop, downscale, and upscale", () => {
    for (const transform of [
      createCoordinateTransform(IDENTITY_MATRIX, 100, 80, 100, 80),
      createCoordinateTransform([1, 0, 120, 0, 1, 40, 0, 0, 1], 200, 150, 640, 480),
      cropToSourceTransform({ x: 50, y: 25, width: 200, height: 100 }, 100, 50, 640, 480),
      cropToSourceTransform({ x: 20, y: 30, width: 100, height: 80 }, 200, 160, 640, 480),
    ]) {
      const point = { x: transform.sourceWidth * 0.37, y: transform.sourceHeight * 0.61 };
      close(transform.inverse(transform.forward(point)), point);
    }
  });

  it.each([0, 90, 180, 270] as const)("inverts a %i degree attempt rotation", (rotation) => {
    const matrix = rotatedToSourceMatrix(rotation, 11, 7);
    const inverse = invertMatrix(matrix);
    const source = { x: 3, y: 4 };
    close(applyMatrix(matrix, applyMatrix(inverse, source)), source);
  });

  it("composes ROI, crop, scale, and rotation", () => {
    const roiToFrame = [1, 0, 100, 0, 1, 60, 0, 0, 1] as const;
    const crop = cropToSourceTransform({ x: 20, y: 10, width: 200, height: 120 }, 100, 60, 400, 300);
    const composed = multiplyMatrices(roiToFrame, multiplyMatrices(crop.matrix, rotatedToSourceMatrix(90, 100, 60)));
    close(applyMatrix(composed, { x: 20, y: 30 }), { x: 180, y: 148 });
  });
});
