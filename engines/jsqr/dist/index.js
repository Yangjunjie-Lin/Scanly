import jsQR from "jsqr";
export class JsQrEngine {
    id = "jsqr";
    version = "1.4.0";
    capabilities = { formats: ["qr_code"], formatClasses: ["matrix"], supportsMultiple: false, returnsRawBytes: true, supportsRawBytes: true, returnsCornerPoints: true, threadSafe: true, estimatedScratchBytesPerPixel: 5, copiesInputBuffer: false, supportsGs1: false, supportsOrientation: false, supportsInversion: true, runtimeKinds: ["browser", "worker", "node"], executionModel: "javascript" };
    async decode(frame, options) {
        const started = Date.now();
        if (options.signal?.aborted)
            return { ok: false, category: "cancelled", message: "Decode cancelled.", elapsedMs: 0 };
        if (!options.formats.includes("qr_code"))
            return { ok: false, category: "unsupported-format", message: "jsQR supports QR Code Model 2 only.", elapsedMs: 0 };
        if (frame.pixelFormat !== "rgba8888" || frame.rowStride !== frame.width * 4)
            return { ok: false, category: "invalid-input", message: "jsQR adapter requires tightly packed RGBA8888 input.", elapsedMs: Date.now() - started };
        const data = frame.data instanceof Uint8ClampedArray ? frame.data : new Uint8ClampedArray(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
        let decoded = null;
        try {
            decoded = jsQR(data, frame.width, frame.height, { inversionAttempts: options.inversion === "inverted" ? "dontInvert" : "attemptBoth" });
        }
        catch (error) {
            return { ok: false, category: "execution", message: error instanceof Error ? error.message : "jsQR execution failed.", elapsedMs: Date.now() - started };
        }
        const elapsedMs = Date.now() - started;
        if (!decoded?.data)
            return { ok: false, category: "not-found", message: "No QR code found.", elapsedMs };
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
//# sourceMappingURL=index.js.map