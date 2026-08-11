import { createRgbaFrame, type NormalizedFrame } from "@scanly/core";

export function syntheticFrame(
  width: number,
  height: number,
  pixel: (x: number, y: number) => number | readonly [number, number, number],
  id = "industrial-test-frame",
): NormalizedFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const value = pixel(x, y);
    const [red, green, blue] = typeof value === "number" ? [value, value, value] : value;
    const index = (y * width + x) * 4;
    data[index] = red; data[index + 1] = green; data[index + 2] = blue; data[index + 3] = 255;
  }
  return createRgbaFrame(data, width, height, { id, ownership: "owned", sourceType: "pixel-buffer" });
}
