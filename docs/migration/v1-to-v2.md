# Migrating from Scanly v1

## Import ownership

| v1 internal path | v2 owner |
| --- | --- |
| `lib/qr/decode-pipeline` | engine-agnostic migration adapter in `@scanly/core/qr`; Node composition in `@scanly/node` |
| `lib/qr/worker/*` | `@scanly/browser` |
| `lib/qr/decode-upload` | `BrowserCaptureSession.scanFile()` |
| React camera/ZXing ownership | `BrowserCameraSource` normalized-frame sampler |
| free-form pipeline config | validated `ScenarioDefinition` |

The optimized QR primitives remain under `packages/core/src/qr`, behind a generic engine-execution boundary. Concrete jsQR and ZXing JavaScript imports live only in their engine packages. The production web demo, upload Worker, main-thread fallback, and camera sampler all enter through `CaptureRouter` and its scenario-compiled operator graph.

## Result changes

- `payload` becomes `rawText` in the public SDK result.
- Decoder, preprocessing, candidate, engine, validation, semantic, trace, and attempt metadata have stable public locations.
- Errors use the stable SDK taxonomy (`no_symbol_found`, `resource_limit_exceeded`, and so on).
- Success remains compile-time and runtime non-empty.
- Frame ownership is explicit; non-borrowed frames transfer release responsibility to Router.

`decodePixelBuffer` remains an explicitly lower-level migration adapter and now requires a caller-supplied engine executor; it no longer owns concrete decoders. Node consumers that need the old shape can use `decodePixelBufferWithNodeEngines` from `@scanly/node`. Neither adapter is the canonical SDK or benchmark path. Migrate applications to `CaptureRouter.scan`, `BrowserCaptureSession.scanFile`, or `BrowserCameraSource` before v2 stable.
