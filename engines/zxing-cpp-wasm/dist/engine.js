import { ZxingCppWasmError, ZxingCppWasmLoader } from "./loader.js";
function cancelled() {
    return { ok: false, category: "cancelled", message: "ZXing-C++ WASM decode was cancelled.", elapsedMs: 0, code: "cancelled" };
}
function toGrayscale(frame) {
    const pixels = frame.width * frame.height;
    if (frame.pixelFormat === "gray8" && frame.rowStride === frame.width) {
        return new Uint8Array(frame.data.buffer, frame.data.byteOffset, pixels);
    }
    const output = new Uint8Array(pixels);
    const channels = frame.pixelFormat === "rgba8888" ? 4 : frame.pixelFormat === "rgb888" ? 3 : 0;
    if (!channels)
        throw new ZxingCppWasmError("native_decode_failed", `ZXing-C++ WASM does not accept ${frame.pixelFormat} input directly.`);
    for (let y = 0; y < frame.height; y += 1) {
        const row = y * frame.rowStride;
        for (let x = 0; x < frame.width; x += 1) {
            const source = row + x * channels;
            output[y * frame.width + x] = (306 * frame.data[source] + 601 * frame.data[source + 1] + 117 * frame.data[source + 2] + 512) >> 10;
        }
    }
    return output;
}
function validPoint(value) {
    return Boolean(value) && typeof value === "object"
        && Number.isFinite(value.x) && Number.isFinite(value.y);
}
export class ZxingCppWasmEngineImpl {
    options;
    id = "zxing-cpp-wasm";
    version = "3.1.1+zxing-cpp.6c2961d";
    capabilities = {
        formats: ["qr_code"],
        supportsMultiple: true,
        returnsRawBytes: true,
        returnsCornerPoints: true,
        threadSafe: false,
        estimatedScratchBytesPerPixel: 2,
        copiesInputBuffer: true,
        runtimeKinds: ["browser", "worker", "node"],
        supportsInversion: true,
        supportsStructuredAppend: true,
        supportsOrientation: true,
        initializationMode: "lazy",
        executionModel: "wasm",
    };
    loader;
    limits;
    initialLinearMemoryBytes = 0;
    peakLinearMemoryBytes = 0;
    inputAllocationBytes = 0;
    peakInputAllocationBytes = 0;
    activeNativeResultCount = 0;
    releasedNativeResultCount = 0;
    constructor(options = {}) {
        this.options = options;
        this.loader = new ZxingCppWasmLoader(options);
        this.limits = {
            maximumPixels: options.maximumPixels ?? 8_000_000,
            maximumInputBytes: options.maximumInputBytes ?? 32 * 1024 * 1024,
            maximumResultCount: options.maximumResultCount ?? 16,
            maximumResultBytes: options.maximumResultBytes ?? 64 * 1024,
            tryHarder: options.tryHarder ?? true,
        };
    }
    get initializationState() { return this.loader.initializationState; }
    get selectedVariant() { return this.loader.selectedVariant; }
    get initializationMs() { return this.loader.initializationMs; }
    get buildMetadata() { return this.loader.buildMetadata; }
    async initialize() {
        await this.loader.initialize();
        const bytes = this.module.HEAPU8.buffer.byteLength;
        if (!this.initialLinearMemoryBytes)
            this.initialLinearMemoryBytes = bytes;
        this.peakLinearMemoryBytes = Math.max(this.peakLinearMemoryBytes, bytes);
    }
    preload() { return this.initialize(); }
    async prewarm() {
        await this.initialize();
        // Exercise the native boundary with a bounded empty image; no user data is involved.
        await this.decode({
            id: "zxing-cpp-prewarm", timestampMs: 0, width: 1, height: 1, rowStride: 1,
            pixelFormat: "gray8", orientation: 0, sourceType: "pixel-buffer", ownership: "owned", data: new Uint8Array([255]),
        }, { formats: ["qr_code"], findMultiple: false });
    }
    async decode(frame, options) {
        const started = performance.now();
        if (options.signal?.aborted)
            return cancelled();
        if (!options.formats.includes("qr_code"))
            return { ok: false, category: "unsupported-format", message: "ZXing-C++ WASM is publicly enabled for QR Code Model 2 only.", elapsedMs: 0 };
        const pixels = frame.width * frame.height;
        if (!Number.isSafeInteger(pixels) || pixels < 1 || pixels > this.limits.maximumPixels) {
            return { ok: false, category: "invalid-input", message: `Image exceeds the ${this.limits.maximumPixels}-pixel ZXing-C++ WASM limit.`, elapsedMs: performance.now() - started };
        }
        if (frame.data.byteLength > this.limits.maximumInputBytes) {
            return { ok: false, category: "invalid-input", message: `Input exceeds the ${this.limits.maximumInputBytes}-byte ZXing-C++ WASM limit.`, elapsedMs: performance.now() - started };
        }
        try {
            await this.initialize();
        }
        catch (error) {
            if (options.signal?.aborted)
                return cancelled();
            const message = error instanceof Error ? error.message : String(error);
            return { ok: false, category: "initialization", message, elapsedMs: performance.now() - started, code: error instanceof ZxingCppWasmError ? error.code : "wasm_instantiate_failed" };
        }
        if (options.signal?.aborted)
            return cancelled();
        let inputPointer = 0;
        let nativeResults;
        try {
            const grayscale = toGrayscale(frame);
            this.inputAllocationBytes += grayscale.byteLength;
            this.peakInputAllocationBytes = Math.max(this.peakInputAllocationBytes, this.inputAllocationBytes);
            inputPointer = this.module._malloc(grayscale.byteLength);
            if (!inputPointer)
                throw new ZxingCppWasmError("out_of_memory", `Unable to allocate ${grayscale.byteLength} bytes in WASM linear memory.`);
            this.module.HEAPU8.set(grayscale, inputPointer);
            nativeResults = this.module.readBarcodesFromPixmap(inputPointer, frame.width, frame.height, {
                formats: "QRCodeModel2",
                tryHarder: this.limits.tryHarder,
                tryRotate: false,
                tryInvert: options.inversion !== "inverted",
                tryDownscale: true,
                tryDenoise: false,
                binarizer: 0,
                isPure: false,
                downscaleThreshold: 500,
                downscaleFactor: 3,
                minLineCount: 2,
                maxNumberOfSymbols: options.findMultiple ? this.limits.maximumResultCount : 1,
                validateOptionalChecksum: false,
                returnErrors: false,
                eanAddOnSymbol: 0,
                textMode: 0,
                characterSet: 0,
                tryCode39ExtendedMode: false,
            });
            const nativeCount = nativeResults.size();
            if (!Number.isSafeInteger(nativeCount) || nativeCount < 0 || nativeCount > this.limits.maximumResultCount) {
                throw new ZxingCppWasmError("invalid_native_result", `Native result count ${nativeCount} is outside the configured limit.`);
            }
            this.activeNativeResultCount += nativeCount;
            const results = [];
            for (let index = 0; index < nativeCount; index += 1) {
                const result = nativeResults.get(index);
                if (!result?.isValid)
                    continue;
                if (!["QRCode", "QRCodeModel2"].includes(result.format))
                    throw new ZxingCppWasmError("invalid_native_result", `Unexpected native format '${String(result.format)}'.`);
                if (typeof result.text !== "string" || result.text.length > this.limits.maximumResultBytes || result.bytes?.byteLength > this.limits.maximumResultBytes) {
                    throw new ZxingCppWasmError("invalid_native_result", "Native payload exceeds the configured output limit.");
                }
                const position = result.position;
                if (!position || ![position.topLeft, position.topRight, position.bottomRight, position.bottomLeft].every(validPoint)) {
                    throw new ZxingCppWasmError("invalid_native_result", "Native result contains invalid corner geometry.");
                }
                results.push({
                    text: result.text,
                    rawBytes: new Uint8Array(result.bytes),
                    format: "qr_code",
                    cornerPoints: [position.topLeft, position.topRight, position.bottomRight, position.bottomLeft].map(({ x, y }) => ({ x, y })),
                    orientation: Number.isFinite(result.orientation) ? result.orientation : undefined,
                    symbologyIdentifier: result.symbologyIdentifier || undefined,
                    engineMetadata: {
                        variant: this.selectedVariant ?? "standard",
                        executionModel: "wasm",
                        initializationMs: this.initializationMs ?? undefined,
                        wasmLinearMemoryBytes: this.module.HEAPU8.buffer.byteLength,
                    },
                    elapsedMs: performance.now() - started,
                });
            }
            if (options.signal?.aborted)
                return { ok: false, category: "cancelled", message: "ZXing-C++ WASM decode was cancelled.", code: "cancelled", elapsedMs: performance.now() - started };
            return results.length
                ? { ok: true, results: results }
                : { ok: false, category: "not-found", message: "No QR Code Model 2 symbol found.", elapsedMs: performance.now() - started };
        }
        catch (error) {
            if (options.signal?.aborted)
                return { ok: false, category: "cancelled", message: "ZXing-C++ WASM decode was cancelled.", code: "cancelled", elapsedMs: performance.now() - started };
            const typed = error instanceof ZxingCppWasmError ? error : new ZxingCppWasmError("native_decode_failed", error instanceof Error ? error.message : String(error), { cause: error });
            return { ok: false, category: typed.code === "out_of_memory" ? "execution" : "execution", message: typed.message, elapsedMs: performance.now() - started, code: typed.code };
        }
        finally {
            const count = nativeResults?.size() ?? 0;
            nativeResults?.delete();
            this.activeNativeResultCount = Math.max(0, this.activeNativeResultCount - count);
            this.releasedNativeResultCount += count;
            if (inputPointer)
                this.module._free(inputPointer);
            this.inputAllocationBytes = 0;
            this.peakLinearMemoryBytes = Math.max(this.peakLinearMemoryBytes, this.module.HEAPU8.buffer.byteLength);
        }
    }
    getMemoryObservation() {
        const current = this.initializationState === "ready" ? this.module.HEAPU8.buffer.byteLength : 0;
        return {
            initialLinearMemoryBytes: this.initialLinearMemoryBytes,
            currentLinearMemoryBytes: current,
            peakLinearMemoryBytes: Math.max(this.peakLinearMemoryBytes, current),
            inputAllocationBytes: this.inputAllocationBytes,
            peakInputAllocationBytes: this.peakInputAllocationBytes,
            activeNativeResultCount: this.activeNativeResultCount,
            releasedNativeResultCount: this.releasedNativeResultCount,
        };
    }
    async dispose() { await this.loader.dispose(); }
    get module() { return this.loader.readerModule; }
}
//# sourceMappingURL=engine.js.map