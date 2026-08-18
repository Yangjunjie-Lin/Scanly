import type { PixelBuffer } from "./types.js";
export interface JsQRDecodeResult {
    payload: string;
    rawBytes: Uint8Array;
}
/**
 * Decode with jsQR. Uses attemptBoth by default; callers may pass invertFirst/onlyInvert.
 */
export declare function decodeWithJsQR(buffer: PixelBuffer, inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst"): JsQRDecodeResult | null;
//# sourceMappingURL=jsqr-decoder.d.ts.map