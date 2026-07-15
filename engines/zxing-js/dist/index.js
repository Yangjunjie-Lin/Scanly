import { decodeWithZXing } from "@scanly/core/qr";
export class ZxingJsEngine {
    id = "zxing-js";
    version = "0.21.3";
    capabilities = { formats: ["qr_code"], supportsMultiple: false, returnsRawBytes: true, returnsCornerPoints: false, threadSafe: false };
    async decode(frame, options) {
        const started = Date.now();
        if (options.signal?.aborted)
            return { ok: false, category: "cancelled", message: "Decode cancelled.", elapsedMs: 0 };
        if (!options.formats.includes("qr_code"))
            return { ok: false, category: "unsupported-format", message: "This ZXing JavaScript adapter is intentionally configured for QR Code only.", elapsedMs: 0 };
        if (frame.pixelFormat !== "rgba8888" || frame.rowStride !== frame.width * 4)
            return { ok: false, category: "invalid-input", message: "ZXing JavaScript adapter requires tightly packed RGBA8888 input.", elapsedMs: Date.now() - started };
        const data = frame.data instanceof Uint8ClampedArray ? frame.data : new Uint8ClampedArray(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
        const decoded = decodeWithZXing({ data, width: frame.width, height: frame.height });
        const elapsedMs = Date.now() - started;
        return decoded ? { ok: true, results: [{ text: decoded.payload, rawBytes: decoded.rawBytes, format: "qr_code", elapsedMs }] } : { ok: false, category: "not-found", message: "No QR code found.", elapsedMs };
    }
}
//# sourceMappingURL=index.js.map