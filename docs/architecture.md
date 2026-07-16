# SDK v2 architecture

Scanly v2 has one local-only capture execution model. Framework adapters compose the runtime; they do not own decoding business logic.

Alpha.3 validation contracts are detailed in [frame orientation](frame-orientation.md), [benchmark provenance](benchmarking/provenance.md), [camera Worker architecture](camera-worker.md), [device validation](device-validation.md), and [API stability](sdk/api-stability.md).

Benchmark outcome and timing rules are documented in [benchmark methodology](benchmark-methodology.md).

## Authoritative execution paths

```text
Browser File -> image adapter -> NormalizedFrame --+
Browser Worker -> validated transferable frame ----+-> CaptureRouter
Node image adapter -> NormalizedFrame -------------+     -> ScenarioCompiler
Camera track -> video/canvas sampler -> CaptureSession    -> dependency-ready operator graph
                                                            -> EngineRegistry
                                                            -> ValidatorRegistry
                                                            -> deterministic ScanOutcome
```

The Worker and main-thread fallback both invoke `CaptureRouter.scan(frame, { scenario })`. The deprecated upload helper constructs a `BrowserCaptureSession`; it does not call the legacy pixel pipeline. If an upload Worker fails to bootstrap or load its module chunks, the session reloads the local `File` and retries once through the main-thread Router; ordinary decoder failures are not masked by this fallback. Camera frames are sampled at a bounded cadence and sent to a persistent transferable-buffer Worker; unsupported or recovering Worker environments use CaptureSession and the same Router on the main thread.

## Dependency direction

```text
scenario-schema       parsers
       \                /
          @scanly/core (contracts, graph, Router; no concrete decoder)
             ^      ^
             |      |
   engine-jsqr      engine-zxing-js
       |                 |
     jsqr          @zxing/library

browser -> core + engines       node -> core + engines + sharp
react -> browser                apps/web-demo -> browser
```

`@scanly/core` has no `jsqr`, ZXing, `sharp`, React, or Next.js dependency. `sharp` is isolated in `@scanly/node`. Concrete engine versions and capabilities come from registered engine instances; Router contains no decoder version map.

## Registries and compilation

- `EngineRegistry` rejects duplicate ids unless replacement is explicit, lazily initializes engines, serializes instance-confined engines, propagates typed initialization errors, disposes once, and rejects use after disposal.
- `OperatorRegistry` owns replaceable graph stages. The default graph contains frame normalization, ROI, localization, candidate generation, candidate deduplication, enhancement planning, geometry, decoder execution, result aggregation, validation, and semantic parsing.
- `ValidatorRegistry` resolves required validators during compilation. Missing required validators fail before frame execution; missing optional validators become bounded warnings.
- `ScenarioCompiler` checks operator/engine availability, format support, thread safety, validators, unsupported quality thresholds, missing dependencies, and cycles. Its LRU-style cache is bounded to 32 entries by default.

Dependency-ready operator branches execute concurrently when safe. Decoder branches execute in scenario order or in parallel only when every requested engine reports thread safety. Aggregation order remains scenario order.

## Ownership and lifecycle

`FrameLease` is created before scenario, frame, budget, or concurrency preflight. Owned/transferred frames are therefore released exactly once on every Router return path; borrowed frames are never released by Scanly. Router disposal aborts and awaits every active scan before clearing compiler caches or disposing engines. Engine disposal waits for both serialized and thread-safe active decodes. Per-frame artifacts and preprocessing caches share one logical retained-buffer budget and release leases in `finally`.

`CaptureSession` supports `idle -> initialized -> running -> stopped -> running -> disposed`. Start/stop are idempotent, configuration/source changes cancel active ownership, stale results are replaced with `cancelled`, and async disposal can await owned Router/engine disposal.

The camera source has one internal stop path for success auto-stop, explicit stop, page hide, source switch, source error, and disposal. It clears timers, active ownership, track/listener registrations, `srcObject`, duplicate/stability state, options, canvas, and video references.

## Bounds and security

The runtime bounds frame pixels, candidates, attempts, results, retained allocations/bytes, execution time, concurrent frames, graph-cache entries, decoded text (65,536 characters), trace events/details, validation messages, warnings, Worker ids/messages, and duplicate history. Pixel data and decoded payloads are not written to traces or errors by default.

No image, analytics event, or decoded payload is uploaded by the SDK. Host actions remain HTTP/HTTPS-only and require application code.

## Compatibility and limits

The shipped engines implement QR Code Model 2 through jsQR and ZXing JavaScript. Micro QR, rMQR, Data Matrix, PDF417, Aztec, linear formats, ZXing-C++ WASM, and native bindings are not installed. The schema can name future engines, but compilation rejects unregistered ids or unsupported formats.

Camera capture defaults to the fast scenario, samples at a maximum 960-pixel side before RGBA readback, prefers `requestVideoFrameCallback`, and keeps one active frame. The camera foundation is browser-tested with mocked media primitives, but physical devices, torch/zoom variants, thermal behavior, and long mobile sessions have not been certified. No industrial-readiness or commercial-SDK parity claim is made.
