# Worker and WASM deployment

`@scanly/browser` v2.0.1 creates a module Worker with a relative ESM asset URL. The package emits `dist/worker/decode-worker.js`; bundlers must copy or chunk the Worker and the packaged ZXing-C++ WASM asset into the application deployment.

The default Browser composition is jsQR → lazy ZXing-C++ WASM → ZXing-JS. Worker ownership is persistent across scans and releases when the session is disposed. Terminating a Worker rejects pending work, prevents stale delivery, and releases its WASM realm; cancellation during synchronous native execution suppresses late delivery rather than preempting native code.

## Asset requirements

- Serve the Worker and WASM from the same origin or an explicitly trusted application-controlled origin.
- Serve `zxing-cpp.wasm` as `application/wasm`.
- Preserve package-relative asset URLs or provide an explicit trusted `assetResolver`.
- Do not replace the pinned asset with a mutable CDN script or user-controlled URL.
- Verify the production Worker and WASM URLs after bundler/framework upgrades.

The loader verifies the packaged WASM SHA-256 and initializes lazily. After application code and assets load, decoding remains local and works without network access.

## CSP

A common starting point is:

```text
worker-src 'self' blob:;
img-src 'self' blob: data:;
```

Some browser/toolchain combinations also require `script-src 'wasm-unsafe-eval'` for WebAssembly compilation. Add it only when the deployed browser matrix requires it. Do not copy a sample CSP blindly: nonce strategy, Safari Worker behavior, custom asset origins, and the host application's other resources must be validated together.

The reference application sets `nosniff`, a strict referrer policy, camera-only Permissions Policy, and frame denial. Scanly has no remote image upload, analytics, or reporting endpoint.

## Main-thread fallback

`BrowserCaptureSession` uses a Worker by default. `{ forceMainThread: true }` exists for environments that cannot create a module Worker; it changes scheduling and responsiveness but does not change the local-only privacy boundary.
