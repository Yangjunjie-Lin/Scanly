/** Convert RGBA buffer to grayscale in-place copy (R=G=B). */
export function toGrayscale(src, budget) {
    const data = new Uint8ClampedArray(src.data);
    for (let i = 0; i < data.length; i += 4) {
        if ((i & 0xffff) === 0)
            budget?.throwIfExceeded("grayscale");
        const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        data[i] = data[i + 1] = data[i + 2] = g;
    }
    return { data, width: src.width, height: src.height };
}
/** Sample luminance at pixel index. */
export function luminanceAt(data, i) {
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}
/** Build a PixelBuffer from raw RGBA. */
export function createPixelBuffer(data, width, height) {
    const clamped = data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
    if (clamped.length < width * height * 4) {
        throw new Error("Pixel buffer too small for given dimensions");
    }
    return { data: clamped, width, height };
}
/** Flatten semi-transparent pixels onto white (QR decoders expect opaque RGB). */
export function flattenAlphaOntoWhite(src) {
    const data = new Uint8ClampedArray(src.data);
    for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3] / 255;
        if (a >= 0.999)
            continue;
        data[i] = Math.round(data[i] * a + 255 * (1 - a));
        data[i + 1] = Math.round(data[i + 1] * a + 255 * (1 - a));
        data[i + 2] = Math.round(data[i + 2] * a + 255 * (1 - a));
        data[i + 3] = 255;
    }
    return { data, width: src.width, height: src.height };
}
/** Deep clone a pixel buffer. */
export function cloneBuffer(src) {
    return {
        data: new Uint8ClampedArray(src.data),
        width: src.width,
        height: src.height,
    };
}
//# sourceMappingURL=grayscale.js.map