import { getZXingModule, prepareZXingModule, purgeZXingModule, } from "zxing-wasm/reader";
import { detectRuntimeKind, supportsWasmSimd, supportsWebAssembly } from "./capability.js";
import { ZXING_CPP_WASM_BUILD_METADATA } from "./metadata.js";
const metadata = ZXING_CPP_WASM_BUILD_METADATA;
export class ZxingCppWasmError extends Error {
    code;
    retryable;
    cause;
    constructor(code, message, options = {}) {
        super(message);
        this.name = "ZxingCppWasmError";
        this.code = code;
        this.retryable = options.retryable ?? ["asset_not_found", "initialization_timeout"].includes(code);
        this.cause = options.cause;
    }
}
let sharedModule = null;
function toBytes(asset) {
    return asset instanceof Uint8Array ? asset : new Uint8Array(asset);
}
async function sha256(bytes) {
    if (!globalThis.crypto?.subtle)
        throw new ZxingCppWasmError("unsupported_runtime", "SHA-256 is unavailable in this runtime.");
    const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
async function readAsset(asset) {
    if (asset instanceof Uint8Array || asset instanceof ArrayBuffer)
        return toBytes(asset);
    const url = asset instanceof URL ? asset : new URL(asset, import.meta.url);
    if (url.protocol === "file:") {
        if (detectRuntimeKind() !== "node")
            throw new ZxingCppWasmError("asset_not_found", "file: WASM assets are supported only in Node.");
        try {
            // Avoid a static node: import in the shared module graph: Webpack/Next
            // otherwise attempts to bundle it for Browser and Worker consumers.
            const nodeProcess = globalThis.process;
            const fileSystem = nodeProcess?.getBuiltinModule?.("node:fs");
            if (!fileSystem?.promises?.readFile) {
                throw new ZxingCppWasmError("unsupported_runtime", "This Node runtime cannot resolve the local WASM asset without a static browser-visible import.");
            }
            return new Uint8Array(await fileSystem.promises.readFile(url));
        }
        catch (cause) {
            if (cause instanceof ZxingCppWasmError)
                throw cause;
            throw new ZxingCppWasmError("asset_not_found", `Unable to read WASM asset '${url.href}'.`, { cause });
        }
    }
    try {
        const response = await fetch(url);
        if (!response.ok)
            throw new Error(`${response.status} ${response.statusText}`);
        return new Uint8Array(await response.arrayBuffer());
    }
    catch (cause) {
        throw new ZxingCppWasmError("asset_not_found", `Unable to fetch WASM asset '${url.href}'.`, { cause });
    }
}
function defaultAsset(variant) {
    if (variant === "simd") {
        throw new ZxingCppWasmError("unsupported_simd", "The packaged SIMD WASM asset is unavailable.");
    }
    // Keep this literal for bundlers that recognize the standard
    // `new URL(asset, import.meta.url)` separately-cacheable asset pattern.
    return new URL("../wasm/zxing-cpp.wasm", import.meta.url);
}
function mapInstantiationError(error) {
    if (error instanceof ZxingCppWasmError)
        return error;
    const message = error instanceof Error ? error.message : String(error);
    const code = /compile|magic word|section|WebAssembly\.CompileError/i.test(message)
        ? "wasm_compile_failed"
        : "wasm_instantiate_failed";
    return new ZxingCppWasmError(code, `ZXing-C++ WASM initialization failed: ${message.slice(0, 1_024)}`, { cause: error });
}
async function withTimeout(promise, timeoutMs) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new ZxingCppWasmError("initialization_timeout", `WASM initialization exceeded ${timeoutMs}ms.`, { retryable: true })), timeoutMs);
            }),
        ]);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
export class ZxingCppWasmLoader {
    options;
    state = "uninitialized";
    initializationPromise;
    module;
    variant = null;
    attempts = 0;
    acquired = false;
    initializedAtMs = null;
    constructor(options = {}) {
        this.options = options;
    }
    get initializationState() { return this.state; }
    get selectedVariant() { return this.variant; }
    get initializationMs() { return this.initializedAtMs; }
    get buildMetadata() { return metadata; }
    get readerModule() {
        if (this.state === "disposed")
            throw new ZxingCppWasmError("disposed", "ZXing-C++ WASM loader has been disposed.");
        if (this.state !== "ready" || !this.module)
            throw new ZxingCppWasmError("wasm_instantiate_failed", "ZXing-C++ WASM is not initialized.");
        return this.module;
    }
    initialize() {
        if (this.state === "disposed")
            return Promise.reject(new ZxingCppWasmError("disposed", "ZXing-C++ WASM loader has been disposed."));
        if (this.state === "ready")
            return Promise.resolve();
        if (this.initializationPromise)
            return this.initializationPromise;
        const maximumAttempts = Math.max(1, Math.min(5, this.options.maxInitializationAttempts ?? 2));
        if (this.state === "failed" && this.attempts >= maximumAttempts) {
            return Promise.reject(new ZxingCppWasmError("wasm_instantiate_failed", `ZXing-C++ WASM initialization circuit is open after ${this.attempts} failed attempts.`));
        }
        this.initializationPromise = this.initializeOnce()
            .catch((error) => {
            this.state = "failed";
            throw mapInstantiationError(error);
        })
            .finally(() => { this.initializationPromise = undefined; });
        return this.initializationPromise;
    }
    async initializeOnce() {
        this.state = "loading";
        this.attempts += 1;
        if (!supportsWebAssembly())
            throw new ZxingCppWasmError("unsupported_runtime", "WebAssembly is unavailable in this runtime.");
        detectRuntimeKind();
        const preference = this.options.variant ?? "auto";
        const simdSupported = supportsWasmSimd();
        if (preference === "simd" && !simdSupported)
            throw new ZxingCppWasmError("unsupported_simd", "The requested SIMD WASM variant is unsupported.");
        const selected = preference === "standard"
            ? "standard"
            : preference === "simd"
                ? "simd"
                : simdSupported && metadata.assets.simd.available ? "simd" : "standard";
        const assetMetadata = metadata.assets[selected];
        if (!assetMetadata.available || !assetMetadata.sha256)
            throw new ZxingCppWasmError(selected === "simd" ? "unsupported_simd" : "asset_not_found", `${selected} WASM asset is not available.`);
        const resolved = await (this.options.assetResolver?.(selected, metadata) ?? defaultAsset(selected));
        const bytes = await readAsset(resolved);
        if (this.options.verifyAssetIntegrity !== false) {
            const actual = await sha256(bytes);
            if (actual !== assetMetadata.sha256)
                throw new ZxingCppWasmError("asset_integrity_failed", `WASM SHA-256 mismatch for ${selected}; expected ${assetMetadata.sha256}, received ${actual}.`);
        }
        const wasmBinary = bytes.slice().buffer;
        if (!WebAssembly.validate(wasmBinary))
            throw new ZxingCppWasmError("wasm_compile_failed", `The ${selected} asset is not a valid WebAssembly module.`);
        const key = `${selected}:${assetMetadata.sha256}`;
        const started = performance.now();
        if (sharedModule && sharedModule.key !== key)
            throw new ZxingCppWasmError("wasm_instantiate_failed", "A different ZXing-C++ WASM variant is already active in this JavaScript realm.");
        if (!sharedModule) {
            const promise = Promise.resolve(prepareZXingModule({
                fireImmediately: true,
                overrides: { wasmBinary, locateFile: () => defaultAsset(selected).href },
            })).then((module) => {
                if (!module)
                    throw new Error("Emscripten returned no reader module.");
                if (sharedModule?.key === key)
                    sharedModule.module = module;
                return module;
            });
            sharedModule = { key, promise, references: 0 };
        }
        try {
            this.module = await withTimeout(sharedModule.promise, Math.max(100, Math.min(60_000, this.options.initializationTimeoutMs ?? 10_000)));
        }
        catch (error) {
            if (sharedModule?.key === key && sharedModule.references === 0) {
                sharedModule = null;
                purgeZXingModule();
            }
            throw error;
        }
        sharedModule.references += 1;
        this.acquired = true;
        this.variant = selected;
        this.initializedAtMs = performance.now() - started;
        this.state = "ready";
    }
    async dispose() {
        if (this.state === "disposed")
            return;
        await this.initializationPromise?.catch(() => undefined);
        if (this.acquired && sharedModule) {
            sharedModule.references = Math.max(0, sharedModule.references - 1);
            if (sharedModule.references === 0) {
                sharedModule = null;
                purgeZXingModule();
            }
        }
        this.acquired = false;
        this.module = undefined;
        this.state = "disposed";
    }
}
//# sourceMappingURL=loader.js.map