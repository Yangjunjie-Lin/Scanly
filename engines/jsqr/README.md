# @scanly/engine-jsqr

QR Code Model 2 engine-contract adapter for jsQR 1.4.0 in Scanly SDK v2.0.0.

```bash
npm install @scanly/core @scanly/engine-jsqr
```

```ts
import { CaptureRouter, EngineRegistry } from "@scanly/core";
import { JsQrEngine } from "@scanly/engine-jsqr";

const engines = new EngineRegistry();
engines.register(new JsQrEngine());
const router = new CaptureRouter({ engines, formats: ["qr_code"] });
```

The adapter is QR-only and single-code. It does not represent the full eight-format SDK contract. This is an advanced engine package; Browser and Node already include it in default composition.

Version: 2.0.0 · [Engine composition documentation](https://github.com/Yangjunjie-Lin/Scanly/blob/main/docs/sdk/usage.md)
