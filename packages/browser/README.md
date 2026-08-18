# @scanly/browser

Browser upload, module Worker, camera, ScannerSession, tracking, batch, and default engine composition for Scanly SDK v2.0.0. The optional ZXing-C++ WASM backend is included and loaded lazily.

```bash
npm install @scanly/browser
```

```js
import { BrowserCaptureSession } from "@scanly/browser";

const scanner = new BrowserCaptureSession();
scanner.initialize();
scanner.start();
const outcome = await scanner.scanFile(file);
if (outcome.ok) console.log(outcome.results);
await scanner.dispose();
```

```ts
import { BrowserCameraSource } from "@scanly/browser";

const camera = new BrowserCameraSource();
await camera.start(videoElement, {
  onResult: console.log,
  onError: console.error,
});
camera.stop();
camera.dispose();
```

The Worker is self-hosted through `new URL(..., import.meta.url)`. Deployments must emit the Worker and WASM asset, serve WASM as `application/wasm`, and permit the Worker URL in CSP `worker-src`. Camera access requires HTTPS or localhost and user permission. Scanly uses no cloud decoder or telemetry.

This is the standard public Browser package. React users may install `@scanly/react`, which depends on it.

Version: 2.0.0 · [Browser usage and deployment](https://github.com/Yangjunjie-Lin/Scanly/blob/main/docs/sdk/usage.md)
