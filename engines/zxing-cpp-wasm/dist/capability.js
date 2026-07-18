// A minimal module returning v128. Validation is side-effect free and does not instantiate code.
const SIMD_PROBE = Uint8Array.from([
    0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
    10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
]);
export function detectRuntimeKind() {
    if (typeof process !== "undefined" && process.versions?.node)
        return "node";
    const realm = globalThis;
    if (typeof realm.importScripts === "function" && realm.document === undefined)
        return "worker";
    if (typeof window !== "undefined")
        return "browser";
    throw Object.assign(new Error("ZXing-C++ WASM requires a supported Browser, Worker, or Node runtime."), { code: "unsupported_runtime" });
}
export function supportsWebAssembly() {
    return typeof WebAssembly === "object" && typeof WebAssembly.validate === "function";
}
export function supportsWasmSimd() {
    if (!supportsWebAssembly())
        return false;
    try {
        return WebAssembly.validate(SIMD_PROBE);
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=capability.js.map