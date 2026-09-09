# @scanly/parsers

Local-only, side-effect-free semantic barcode payload parsers for Scanly SDK v2.0.1.

```bash
npm install @scanly/parsers
```

```ts
import { isSafeActionUrl, parseSemanticPayload } from "@scanly/parsers";

const parsed = parseSemanticPayload("https://example.com");
if (isSafeActionUrl(parsed.rawText)) console.log(parsed.structured);
```

Parsers never replace or mutate raw decode text and never execute URLs, Wi-Fi joins, calls, messages, or calendar actions.

This is an advanced public package. Most applications receive parsed metadata through Browser or Node scan results and do not need to install it directly.

Version: 2.0.1 · [Repository and documentation](https://github.com/Yangjunjie-Lin/Scanly)
