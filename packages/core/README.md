# @scanly/core

`@scanly/core` is the framework-independent core for Scanly SDK v2.1.0. It provides frame/result/error contracts, engine and operator registries, `CaptureRouter`, sessions, tracking, batch, and bounded industrial recovery without React or Next.js dependencies.

```bash
npm install @scanly/core @scanly/engine-zxing-cpp-wasm
```

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

The public format contract contains QR Code, Data Matrix, PDF417, Code 128, EAN-13, EAN-8, UPC-A, and UPC-E. Core does not bundle or register concrete decoders by itself; actual support depends on registered engine capabilities. Browser and Node packages provide the default engine composition.

This is an advanced public package. Prefer `@scanly/browser`, `@scanly/node`, or `@scanly/react` for standard applications.

Version: 2.1.0 · [SDK documentation](https://github.com/Yangjunjie-Lin/Scanly/blob/main/docs/sdk/usage.md)
