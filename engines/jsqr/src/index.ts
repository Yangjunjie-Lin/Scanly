import type { DecoderEngine, EngineDecodeOptions, EngineOutcome, NormalizedFrame } from "@scanly/core";
import { decodeWithJsQR } from "@scanly/core/qr";

export class JsQrEngine implements DecoderEngine {
  readonly id = "jsqr";
  readonly version = "1.4.0";
  readonly capabilities = { formats: ["qr_code" as const], supportsMultiple: false, returnsRawBytes: true, returnsCornerPoints: false, threadSafe: true };
  async decode(frame: NormalizedFrame, options: EngineDecodeOptions): Promise<EngineOutcome> {
    const started = Date.now();
    if (options.signal?.aborted) return { ok: false, category: "cancelled", message: "Decode cancelled.", elapsedMs: 0 };
    if (!options.formats.includes("qr_code")) return { ok: false, category: "unsupported-format", message: "jsQR supports QR Code Model 2 only.", elapsedMs: 0 };
    if (frame.pixelFormat !== "rgba8888" || frame.rowStride !== frame.width * 4) return { ok: false, category: "invalid-input", message: "jsQR adapter requires tightly packed RGBA8888 input.", elapsedMs: Date.now() - started };
    const data = frame.data instanceof Uint8ClampedArray ? frame.data : new Uint8ClampedArray(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
    const decoded = decodeWithJsQR({ data, width: frame.width, height: frame.height });
    const elapsedMs = Date.now() - started;
    return decoded ? { ok: true, results: [{ text: decoded.payload, rawBytes: decoded.rawBytes, format: "qr_code", elapsedMs }] } : { ok: false, category: "not-found", message: "No QR code found.", elapsedMs };
  }
}
