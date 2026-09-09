# Scanly SDK v2.0.1 usage

Scanly SDK v2.0.1 packages are published Stable packages. Browser, Node, and React packages declare all required Scanly dependencies; install only the public runtime package your application uses.

## Browser

```bash
npm install @scanly/browser
```

```js
import { BrowserCaptureSession } from "@scanly/browser";

const scanner = new BrowserCaptureSession();
scanner.initialize();
scanner.start();

const outcome = await scanner.scanFile(fileInput.files[0]);
if (outcome.ok) {
  for (const result of outcome.results) console.log(result.format, result.rawText);
} else {
  console.error(outcome.error.code, outcome.error.message);
}

await scanner.dispose();
```

The browser runtime uses a module Worker by default and transfers the RGBA backing buffer. Pass `{ forceMainThread: true }` only when a deployment cannot create the Worker.

## Node.js

```bash
npm install @scanly/node
```

```js
import { createNodeCaptureRouter, loadNormalizedFrameFromPath } from "@scanly/node";

const router = createNodeCaptureRouter({
  formats: ["qr_code", "data_matrix", "pdf417", "code_128"],
});
const frame = await loadNormalizedFrameFromPath("shipping-label.png");
const outcome = await router.scan(frame);
if (outcome.ok) console.log(outcome.results);
await router.dispose();
```

`sharp` is isolated inside `@scanly/node`; it is not added to Browser or Core dependency graphs.

## React

```bash
npm install @scanly/react
```

```tsx
"use client";
import { useScanly } from "@scanly/react";

export function UploadScanner() {
  const { outcome, scanning, scanFile, cancel } = useScanly();
  return <>
    <input type="file" accept="image/*" onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      if (file) void scanFile(file);
    }} />
    <button type="button" onClick={cancel} disabled={!scanning}>Cancel</button>
    <output>{outcome?.ok ? outcome.primary.rawText : ""}</output>
  </>;
}
```

React does not decode. `useScanly` owns a `BrowserCaptureSession`, disposes its session and Worker on unmount, and exposes the session for explicit composition. Camera UI should compose `BrowserCameraSource` from `@scanly/browser` in a React effect and stop/dispose it during cleanup.

## Advanced / Core

```bash
npm install @scanly/core @scanly/engine-zxing-cpp-wasm
```

Core is the framework-independent public composition layer; it does not register a concrete decoder automatically.

```ts
import { CaptureRouter, EngineRegistry, createRgbaFrame } from "@scanly/core";
import { createZxingCppWasmEngine } from "@scanly/engine-zxing-cpp-wasm";

const engines = new EngineRegistry();
engines.register(createZxingCppWasmEngine());
const router = new CaptureRouter({ engines, formats: ["qr_code", "data_matrix"] });
const frame = createRgbaFrame(rgba, width, height, { ownership: "borrowed" });
const outcome = await router.scan(frame);
await router.dispose();
```

## WASM, Worker, and CSP

Browser and Node default composition includes the optional ZXing-C++ WASM backend. It initializes lazily; pass `zxingCppWasm: false` for JavaScript-only composition or create the engine explicitly for preload/prewarm control.

The SDK does not fetch mutable code from a CDN. Bundlers must emit the module Worker and packaged `zxing-cpp.wasm`, serve WASM as `application/wasm`, and keep both assets same-origin or on an explicitly trusted origin. CSP must permit the emitted Worker URL through `worker-src`; stricter deployments may also need `script-src 'wasm-unsafe-eval'` according to browser policy. See [Worker deployment](worker-deployment.md) and [WASM deployment](../wasm-engine.md).

## Camera lifecycle

```ts
import { BrowserCameraSource } from "@scanly/browser";

const camera = new BrowserCameraSource();
await camera.start(videoElement, {
  stopAfterResult: false,
  onResult: (result) => console.log(result.ok && result.primary.rawText),
  onError: (failure) => console.error(failure.error.code),
});

camera.stop();
camera.dispose();
```

Camera APIs require a secure context (HTTPS or localhost) and user permission. Query the active track for torch, zoom, and focus capabilities; never infer physical support from emulation.

## Multiple formats and codes

The public format vocabulary is `qr_code`, `data_matrix`, `pdf417`, `code_128`, `ean_13`, `ean_8`, `upc_a`, and `upc_e`. The default is QR-only. Balanced and robust multi-code scenarios can return more than one result:

```ts
if (outcome.ok) {
  const [primary, ...additional] = outcome.results;
  console.log(primary.rawText, additional.map((item) => item.rawText));
}
```

## Industrial recovery

```ts
const scanner = new BrowserCaptureSession({
  scenario: getBuiltinScenario("multiformat-balanced"),
  recovery: { profile: "industrial" },
});
```

Use `dpm-experimental` only for evaluation. Industrial recovery does not claim industrial, warehouse, or DPM certification, and no path guesses a payload.

## Privacy and validation boundary

Decode, parsing, tracking, and recovery are local-only and offline-capable after assets load. Scanly has no image upload or analytics endpoint. Automated browser, simulator, and emulator coverage is not physical-device qualification; physical validation remains `POST_RELEASE_VALIDATION_PENDING` under [Issue #13](https://github.com/Yangjunjie-Lin/Scanly/issues/13).
