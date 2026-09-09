# @scanly/engine-zxing-js

QR Code engine-contract adapter for `@zxing/library` 0.21.3 in Scanly SDK v2.0.1.

```bash
npm install @scanly/core @scanly/engine-zxing-js
```

```ts
import { CaptureRouter, EngineRegistry } from "@scanly/core";
import { ZxingJsEngine } from "@scanly/engine-zxing-js";

const engines = new EngineRegistry();
engines.register(new ZxingJsEngine());
const router = new CaptureRouter({ engines, formats: ["qr_code"] });
```

This adapter intentionally configures the ZXing JavaScript QR reader only. It does not claim additional barcode formats. This is an advanced engine package; Browser and Node already include it as a QR fallback.

Version: 2.0.1 · [Engine composition documentation](https://github.com/Yangjunjie-Lin/Scanly/blob/main/docs/sdk/usage.md)
