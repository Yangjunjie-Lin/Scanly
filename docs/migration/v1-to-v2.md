# Migrating from Scanly v1 to v2.0.1

Scanly v2.0.1 is the current Stable SDK. Migrate by selecting the runtime package instead of importing repository-internal v1 modules.

## Install a public package

```bash
npm install @scanly/browser  # Browser upload, Worker, and camera runtime
npm install @scanly/node     # Node image loading and default engine composition
npm install @scanly/react    # React adapter over the Browser runtime
```

Direct `@scanly/core` use is intended for advanced engine or operator composition. Applications do not need to install Scanly's internal workspace dependencies separately.

## Import ownership

| v1 internal path or ownership | v2 owner |
| --- | --- |
| `lib/qr/decode-pipeline` | engine-agnostic adapter in `@scanly/core/qr`; default Node composition in `@scanly/node` |
| `lib/qr/worker/*` | `@scanly/browser` |
| `lib/qr/decode-upload` | `BrowserCaptureSession.scanFile()` |
| React-owned camera/decoder state | `@scanly/browser` camera/session runtime; React remains an adapter |
| Free-form pipeline configuration | runtime-validated `ScenarioDefinition` |

Concrete jsQR, ZXing-JS, and ZXing-C++ WASM decoders live in engine packages. Browser upload, Worker, camera, Node, and Native entry points share the public result/format contract.

## Result and error changes

- `payload` becomes `rawText`.
- A successful outcome contains non-empty `results` and `primary` is the first result.
- Every result identifies its public `format`; optional raw bytes, corners, orientation, and diagnostics are emitted only when the engine supplies them.
- Errors use stable codes such as `no_symbol_found`, `unsupported_format`, `cancelled`, and `resource_limit_exceeded`; do not switch on message text.
- Frame ownership is explicit. Router releases owned/transferred frames and leaves borrowed buffers to the caller.

## Browser Worker and camera changes

`BrowserCaptureSession` owns upload scanning and its persistent module Worker. Dispose the session when finished. The Worker and WASM assets are self-hosted by the application build; update CSP `worker-src` and asset rules as described in [Worker deployment](../sdk/worker-deployment.md).

Camera composition uses `BrowserCameraSource` and the ScannerSession runtime. Camera access requires HTTPS or localhost. The host still owns permission UI, video rendering, lifecycle integration, and capability-dependent controls.

## Formats and scenarios

v2.0.1 supports QR Code, Data Matrix, PDF417, Code 128, EAN-13, EAN-8, UPC-A, and UPC-E. The default remains QR-only for compatibility; opt into additional formats explicitly or use a multi-format built-in scenario.

```ts
const router = createNodeCaptureRouter({
  formats: ["qr_code", "data_matrix", "code_128"],
});
```

The lower-level `decodePixelBuffer` adapter requires a caller-supplied engine executor. Node consumers preserving the old pixel-buffer shape can temporarily use `decodePixelBufferWithNodeEngines`, but new code should use `CaptureRouter.scan`, `BrowserCaptureSession.scanFile`, or `BrowserCameraSource`.

## Native availability

- iOS 13+: `ScanlySDK` source package under `native/ios` at tag `v2.0.1`.
- Android API 24+: `scanly-sdk-2.0.1.aar` from the v2.0.1 GitHub Release for `arm64-v8a` and `x86_64`.

See the [iOS](../native/ios-getting-started.md) and [Android](../native/android-getting-started.md) guides. Physical-device qualification remains pending under Issue #13 and is not implied by automated simulator/emulator coverage.
