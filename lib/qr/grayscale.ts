import type { PixelBuffer } from "./types";

/** Convert RGBA buffer to grayscale in-place copy (R=G=B). */
export function toGrayscale(src: PixelBuffer): PixelBuffer {
  const data = new Uint8ClampedArray(src.data);
  for (let i = 0; i < data.length; i += 4) {
    const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = data[i + 1] = data[i + 2] = g;
  }
  return { data, width: src.width, height: src.height };
}

/** Sample luminance at pixel index. */
export function luminanceAt(data: Uint8ClampedArray, i: number): number {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

/** Build a PixelBuffer from raw RGBA. */
export function createPixelBuffer(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): PixelBuffer {
  const clamped =
    data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  if (clamped.length < width * height * 4) {
    throw new Error("Pixel buffer too small for given dimensions");
  }
  return { data: clamped, width, height };
}

/** Flatten semi-transparent pixels onto white (QR decoders expect opaque RGB). */
export function flattenAlphaOntoWhite(src: PixelBuffer): PixelBuffer {
  const data = new Uint8ClampedArray(src.data);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    if (a >= 0.999) continue;
    data[i] = Math.round(data[i] * a + 255 * (1 - a));
    data[i + 1] = Math.round(data[i + 1] * a + 255 * (1 - a));
    data[i + 2] = Math.round(data[i + 2] * a + 255 * (1 - a));
    data[i + 3] = 255;
  }
  return { data, width: src.width, height: src.height };
}

/** Deep clone a pixel buffer. */
export function cloneBuffer(src: PixelBuffer): PixelBuffer {
  return {
    data: new Uint8ClampedArray(src.data),
    width: src.width,
    height: src.height,
  };
}
