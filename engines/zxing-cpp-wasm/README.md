# @scanly/engine-zxing-cpp-wasm

Optional, lazy ZXing-C++ WebAssembly engine for Scanly SDK v2.1.0. It implements the public QR Code, Data Matrix, PDF417, Code 128, EAN-13, EAN-8, UPC-A, and UPC-E format mappings.

```bash
npm install @scanly/engine-zxing-cpp-wasm
```

```ts
import { createZxingCppWasmEngine } from "@scanly/engine-zxing-cpp-wasm";

const engine = createZxingCppWasmEngine({ variant: "auto" });
await engine.initialize();
// Register the engine in a Scanly EngineRegistry and reuse it.
await engine.dispose();
```

Requests remain explicitly format-filtered. The loader resolves the packaged WASM asset, verifies SHA-256, deduplicates concurrent initialization, and never downloads mutable code by default. Browser/Worker deployments must emit the packaged asset and serve it as `application/wasm`; custom `assetResolver` URLs are trusted-code boundaries.

The shipped asset is standard WASM. SIMD selection is implemented, but no SIMD performance claim is made without a separately shipped and measured SIMD asset. Cancellation during synchronous native execution is cooperative.

This is an advanced public engine package. Browser and Node use it automatically unless `zxingCppWasm: false` is configured.

Version: 2.1.0 · [WASM deployment documentation](https://github.com/Yangjunjie-Lin/Scanly/blob/main/docs/wasm-engine.md)
