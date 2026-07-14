import jsQR from "jsqr";
import type { PixelBuffer } from "./types";

export interface JsQRDecodeResult {
  payload: string;
}

/**
 * Decode with jsQR. Uses attemptBoth by default; callers may pass invertFirst/onlyInvert.
 */
export function decodeWithJsQR(
  buffer: PixelBuffer,
  inversionAttempts: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst" = "attemptBoth"
): JsQRDecodeResult | null {
  if (buffer.width < 1 || buffer.height < 1) return null;
  try {
    const code = jsQR(buffer.data, buffer.width, buffer.height, { inversionAttempts });
    if (!code?.data) return null;
    return { payload: code.data };
  } catch {
    return null;
  }
}
