# @scanly/engine-zxing-cpp-wasm

Experimental, optional ZXing-C++ WebAssembly engine for Scanly SDK v2 Alpha.5.
The public Alpha.5 mask enables QR Code Model 2, Data Matrix ECC 200, PDF417, Code 128, EAN-13, EAN-8, UPC-A, and UPC-E. Requests remain format-filtered; the engine never receives an implicit all-formats mask.

The package never downloads code by default. Its loader resolves the packaged
WASM asset relative to the installed package, verifies SHA-256, and initializes
only when requested. Concurrent initialization calls share one promise.

```ts
import { createZxingCppWasmEngine } from "@scanly/engine-zxing-cpp-wasm";

const engine = createZxingCppWasmEngine({ variant: "auto" });
await engine.initialize();
// Register engine in a Scanly EngineRegistry, reuse it, then:
await engine.dispose();
```

Browser and Worker deployments must serve `wasm/zxing-cpp.wasm` with
`application/wasm`. Node reads the same asset from the installed package.
Consumers with a custom asset pipeline can provide `assetResolver`; the URL is
a trusted-code boundary and should not accept untrusted user input.

The current pinned upstream distribution has a standard WASM asset only.
SIMD detection and selection are implemented, but Alpha.4 does not report SIMD
acceleration until a separately built and benchmarked SIMD artifact is present.
Cancellation during native execution is cooperative: Scanly suppresses a late
result, but does not claim preemptive interruption of synchronous native code.
