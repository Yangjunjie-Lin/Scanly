import type { DecoderEngine, EngineDecodeOptions, EngineOutcome, NormalizedFrame } from "@scanly/core";
import jsQR from "jsqr";

export class JsQrEngine implements DecoderEngine {
  readonly id = "jsqr";
  readonly version = "1.4.0";
  readonly capabilities = { formats: ["qr_code" as const], supportsMultiple: false, returnsRawBytes: true, returnsCornerPoints: true, threadSafe: true };
  async decode(frame: NormalizedFrame, options: EngineDecodeOptions): Promise<EngineOutcome> {
    const started = Date.now();
    if (options.signal?.aborted) return { ok: false, category: "cancelled", message: "Decode cancelled.", elapsedMs: 0 };
    if (!options.formats.includes("qr_code")) return { ok: false, category: "unsupported-format", message: "jsQR supports QR Code Model 2 only.", elapsedMs: 0 };
    if (frame.pixelFormat !== "rgba8888" || frame.rowStride !== frame.width * 4) return { ok: false, category: "invalid-input", message: "jsQR adapter requires tightly packed RGBA8888 input.", elapsedMs: Date.now() - started };
    const data = frame.data instanceof Uint8ClampedArray ? frame.data : new Uint8ClampedArray(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
    let decoded: ReturnType<typeof jsQR> = null;
    try {
      decoded = jsQR(data, frame.width, frame.height, { inversionAttempts: options.inversion === "inverted" ? "dontInvert" : "attemptBoth" });
    } catch (error) {
      return { ok: false, category: "execution", message: error instanceof Error ? error.message : "jsQR execution failed.", elapsedMs: Date.now() - started };
    }
    const elapsedMs = Date.now() - started;
    if (!decoded?.data) return { ok: false, category: "not-found", message: "No QR code found.", elapsedMs };
    const { topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner } = decoded.location;
    return { ok: true, results: [{
      text: decoded.data,
      rawBytes: Uint8Array.from(decoded.binaryData),
      format: "qr_code",
      cornerPoints: [topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner],
      elapsedMs,
    }] };
  }
}
