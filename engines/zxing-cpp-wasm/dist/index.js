export { supportsWasmSimd, supportsWebAssembly, detectRuntimeKind } from "./capability.js";
export { ZxingCppWasmError, ZxingCppWasmLoader } from "./loader.js";
export { ZxingCppWasmEngineImpl } from "./engine.js";
export { ZXING_CPP_WASM_BUILD_METADATA } from "./metadata.js";
export { SCANLY_TO_NATIVE_FORMAT, NATIVE_TO_SCANLY_FORMAT, nativeFormatsFor, scanlyFormatFromNative } from "./formats.js";
import { ZxingCppWasmEngineImpl } from "./engine.js";
export function createZxingCppWasmEngine(options = {}) {
    return new ZxingCppWasmEngineImpl(options);
}
export async function initializeZxingCppWasm(options = {}) {
    const engine = createZxingCppWasmEngine(options);
    await engine.initialize();
    return engine;
}
//# sourceMappingURL=index.js.map