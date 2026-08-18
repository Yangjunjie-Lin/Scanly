import type { PixelBuffer } from "./types.js";
export interface ZXingDecodeResult {
    payload: string;
    rawBytes?: Uint8Array;
}
/** Decode QR from RGBA pixel buffer using ZXing library (works in Node and browser). */
export declare function decodeWithZXing(buffer: PixelBuffer): ZXingDecodeResult | null;
//# sourceMappingURL=zxing-decoder.d.ts.map