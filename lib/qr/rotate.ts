import type { PixelBuffer, RotationDegrees } from "./types";

/** Rotate RGBA buffer by 0/90/180/270 degrees clockwise. */
export function rotateBuffer(src: PixelBuffer, degrees: RotationDegrees): PixelBuffer {
  if (degrees === 0) {
    return { data: new Uint8ClampedArray(src.data), width: src.width, height: src.height };
  }
  const { width: w, height: h, data } = src;

  if (degrees === 180) {
    const out = new Uint8ClampedArray(data.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = (y * w + x) * 4;
        const di = ((h - 1 - y) * w + (w - 1 - x)) * 4;
        out[di] = data[si];
        out[di + 1] = data[si + 1];
        out[di + 2] = data[si + 2];
        out[di + 3] = data[si + 3];
      }
    }
    return { data: out, width: w, height: h };
  }

  const outW = h;
  const outH = w;
  const out = new Uint8ClampedArray(outW * outH * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      let dx: number;
      let dy: number;
      if (degrees === 90) {
        dx = h - 1 - y;
        dy = x;
      } else {
        // 270
        dx = y;
        dy = w - 1 - x;
      }
      const di = (dy * outW + dx) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
    }
  }
  return { data: out, width: outW, height: outH };
}
