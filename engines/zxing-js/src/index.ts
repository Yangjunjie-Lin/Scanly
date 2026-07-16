import type { DecoderEngine, EngineDecodeOptions, EngineOutcome, NormalizedFrame } from "@scanly/core";
import { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "@zxing/library";

export class ZxingJsEngine implements DecoderEngine {
  readonly id = "zxing-js";
  readonly version = "0.21.3";
  readonly capabilities = { formats: ["qr_code" as const], supportsMultiple: false, returnsRawBytes: true, returnsCornerPoints: false, threadSafe: false, estimatedScratchBytesPerPixel: 1, copiesInputBuffer: true };
  private readonly reader = new QRCodeReader();
  async decode(frame: NormalizedFrame, options: EngineDecodeOptions): Promise<EngineOutcome> {
    const started = Date.now();
    if (options.signal?.aborted) return { ok: false, category: "cancelled", message: "Decode cancelled.", elapsedMs: 0 };
    if (!options.formats.includes("qr_code")) return { ok: false, category: "unsupported-format", message: "This ZXing JavaScript adapter is intentionally configured for QR Code only.", elapsedMs: 0 };
    if (frame.pixelFormat !== "rgba8888" || frame.rowStride !== frame.width * 4) return { ok: false, category: "invalid-input", message: "ZXing JavaScript adapter requires tightly packed RGBA8888 input.", elapsedMs: Date.now() - started };
    const data = frame.data instanceof Uint8ClampedArray ? frame.data : new Uint8ClampedArray(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
    let decoded: { text: string; rawBytes?: Uint8Array } | null = null;
    try {
      const luminance = new Uint8ClampedArray(frame.width * frame.height);
      for (let i = 0, j = 0; i < data.length; i += 4, j++) luminance[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
      const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, frame.width, frame.height)));
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const result = this.reader.decode(bitmap, hints);
      const text = result?.getText();
      if (text) decoded = { text, ...(result.getRawBytes()?.byteLength ? { rawBytes: result.getRawBytes() } : {}) };
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (!/NotFound|Checksum|Format/.test(name)) {
        return { ok: false, category: "execution", message: error instanceof Error ? error.message : "ZXing execution failed.", elapsedMs: Date.now() - started };
      }
    }
    const elapsedMs = Date.now() - started;
    return decoded ? { ok: true, results: [{ text: decoded.text, rawBytes: decoded.rawBytes, format: "qr_code", elapsedMs }] } : { ok: false, category: "not-found", message: "No QR code found.", elapsedMs };
  }
}
