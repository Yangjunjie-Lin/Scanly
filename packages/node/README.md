# @scanly/node

Node.js image loading and default local engine composition for Scanly SDK v2.0.0. `sharp` is isolated here and never enters Core or Browser dependency graphs.

```bash
npm install @scanly/node
```

```js
import { createNodeCaptureRouter, loadNormalizedFrameFromPath } from "@scanly/node";

const router = createNodeCaptureRouter({ formats: ["qr_code", "data_matrix"] });
const frame = await loadNormalizedFrameFromPath("label.png");
const outcome = await router.scan(frame);
if (outcome.ok) console.log(outcome.results);
await router.dispose();
```

The default composition is jsQR → lazy ZXing-C++ WASM → ZXing-JS. Pass `zxingCppWasm: false` only for a QR-only JavaScript composition. Decoding is local and no image is uploaded.

This is the standard public Node package. Lower-level pixel-buffer and industrial recovery helpers are advanced APIs.

Version: 2.0.0 · [Node usage](https://github.com/Yangjunjie-Lin/Scanly/blob/main/docs/sdk/usage.md)
