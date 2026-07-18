# ZXing-C++ WebAssembly engine

`@scanly/engine-zxing-cpp-wasm` is an optional Alpha.4 QR Code Model 2 engine. It does not enable the other formats supported by upstream ZXing-C++.

## Identity and reproducibility

- Distribution: `zxing-wasm@3.1.1`, with npm integrity pinned in `package-lock.json`
- Distribution source: `41d92eadda2a556dff9a044ff29fd3e41e70c657`
- ZXing-C++ source: `6c2961d2a9ea4bc4e4ae8f37b1497299f04dd861`
- Canonical environment: Ubuntu 24.04 x64, Node 24, Emscripten 5.0.4, CMake 3.14+
- Standard WASM SHA-256: `6a858c01e076bab3a1bd413e4f2cf5e5e45f819a0d9441d83c66993bc48ed38f`
- Standard asset: 1,065,634 bytes, separately cacheable
- Measured loader JavaScript: 48,455 bytes minified / 17,414 bytes gzip
- Measured standard WASM: 449,726 bytes gzip / 349,800 bytes Brotli
- Optional loader plus standard asset: 467,140 bytes gzip before transport headers

These local Alpha.4 bundle measurements are regression inputs, not network promises. The binary is first-load cost when the engine is requested and can be cached independently; a warm persistent Worker or Node instance does not fetch or compile it for every frame.

`npm run wasm:build` copies the reader-only artifact from the pinned package and checks its hash. `npm run wasm:verify` validates metadata, size, SHA-256, WebAssembly syntax, licenses, and the explicitly unavailable SIMD entry. Runtime decoding never downloads executable code.

The maintained distribution route was selected over duplicating the full native source tree. Its upstream source, native wrapper and build workflow are attributable and pinned; `NOTICE` records the license chain. Scanly's TypeScript native boundary and loader are separately hashed in benchmark provenance.

## Initialization and selection

```ts
import {
  createZxingCppWasmEngine,
  initializeZxingCppWasm,
} from "@scanly/engine-zxing-cpp-wasm";

const cold = createZxingCppWasmEngine({ variant: "auto" });
await cold.preload();
await cold.prewarm();
await cold.dispose();

const ready = await initializeZxingCppWasm({ initializationTimeoutMs: 10_000 });
```

States are `uninitialized`, `loading`, `ready`, `failed`, and `disposed`. Concurrent initialization shares one promise. Recoverable failure retries are bounded; deterministic repeated failure opens the circuit. A disposed instance rejects later initialization or decode.

`auto` selects SIMD only if runtime detection succeeds and a verified SIMD asset is present. Alpha.4 ships no SIMD asset, so `auto` selects standard and explicit `simd` fails with `unsupported_simd`. This is capability plumbing, not an acceleration claim.

## Deployment

The default resolver uses `new URL("../wasm/zxing-cpp.wasm", import.meta.url)`. Node reads the installed `file:` URL. Browsers and Workers fetch the package-relative URL when the engine is first requested. Serve it with `application/wasm`, include it in copied package assets, and allow its origin in `connect-src`. `wasm-unsafe-eval` may be required by strict CSP implementations for WebAssembly compilation.

A custom `assetResolver` may return trusted bytes or a trusted local URL. Treat it as executable-code configuration: never pass a user-controlled URL. Integrity checking is on by default.

## Runtime policy

- Fast: jsQR remains first and defers WASM fallback, avoiding a cold native compile on the first camera frame unless the consumer explicitly preloads or prewarms.
- Balanced/Robust: three cheap jsQR attempts on the first candidate, one original full-frame ZXing-C++ pass, then bounded preprocessing and ZXing-JS fallback.
- Worker: one registry and module are retained per persistent Worker; Worker termination releases the whole realm.
- Node: the same engine contract reads the installed local asset and supports instance reuse and disposal without DOM APIs.

Every attempt records the actual engine. A JavaScript fallback result is never labelled as ZXing-C++. Initialization, no-symbol, execution, timeout and cancellation are distinct outcomes.

## Memory and security

The adapter converts controlled RGBA/RGB input to grayscale and uses matching `_malloc`/`_free` plus native result-vector `delete()`. Defaults cap input at 8 million pixels and 32 MiB, results at 16 symbols and 64 KiB per payload. Dimensions, allocations, native count, payload length and geometry are validated before normalization.

Reported metrics keep Scanly-controlled buffers, WASM linear memory, and process/heap observations separate. The current asset begins around 21 MiB of linear memory and can grow; this is retained module memory, not a Scanly heap leak. `getMemoryObservation()` exposes current/peak linear memory, active input bytes, and released result counts.

Cancellation before or during loading prevents delivery. The synchronous native call cannot be preempted; cancellation during it is cooperative and suppresses the late result. Worker termination is the hard isolation boundary.

## Limitations

Only QR Code Model 2 is public. Standard WASM is shipped; SIMD, threads, calibrated confidence, native mobile bindings and broad symbology support are deferred. Browser/device support still depends on HTTPS, CSP, Worker policy, permissions, and asset deployment.
