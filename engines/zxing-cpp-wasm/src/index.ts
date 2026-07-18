export { supportsWasmSimd, supportsWebAssembly, detectRuntimeKind } from "./capability.js";
export { ZxingCppWasmError, ZxingCppWasmLoader } from "./loader.js";
export { ZxingCppWasmEngineImpl } from "./engine.js";
export { ZXING_CPP_WASM_BUILD_METADATA } from "./metadata.js";
export type * from "./types.js";

import { ZxingCppWasmEngineImpl } from "./engine.js";
import type { ZxingCppWasmEngine, ZxingCppWasmEngineOptions } from "./types.js";

export function createZxingCppWasmEngine(options: ZxingCppWasmEngineOptions = {}): ZxingCppWasmEngine {
  return new ZxingCppWasmEngineImpl(options);
}

export async function initializeZxingCppWasm(options: ZxingCppWasmEngineOptions = {}): Promise<ZxingCppWasmEngine> {
  const engine = createZxingCppWasmEngine(options);
  await engine.initialize();
  return engine;
}
