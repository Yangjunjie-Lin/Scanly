import { describe, expect, it } from "vitest";
import { normalizeRgbaOrientation, sourceToUprightMatrix } from "../../packages/core/src/runtime/frame-normalization.js";
import { applyMatrix } from "../../packages/core/src/qr/geometry.js";

function pixels(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    data[index * 4] = index + 1;
    data[index * 4 + 3] = 255;
  }
  return { data, width, height };
}

describe("canonical frame orientation", () => {
  it.each([0, 90, 180, 270] as const)("normalizes %s degree source metadata", (orientation) => {
    const source = pixels(2, 3);
    const normalized = normalizeRgbaOrientation(source, orientation);
    expect([normalized.buffer.width, normalized.buffer.height]).toEqual(orientation === 90 || orientation === 270 ? [3, 2] : [2, 3]);
    const mapped = applyMatrix(sourceToUprightMatrix(orientation, 2, 3), { x: 0, y: 0 });
    const expected = orientation === 0 ? { x: 0, y: 0 } : orientation === 90 ? { x: 2, y: 0 } : orientation === 180 ? { x: 1, y: 2 } : { x: 0, y: 1 };
    expect(mapped).toEqual(expected);
  });

  it("round-trips raw and upright coordinates for a non-square 90 degree frame", () => {
    const normalized = normalizeRgbaOrientation(pixels(2, 3), 90);
    const upright = normalized.sourceToUpright.forward({ x: 1, y: 2 });
    expect(normalized.sourceToUpright.inverse(upright)).toEqual({ x: 1, y: 2 });
  });
});
