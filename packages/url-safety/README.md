# @scanly/url-safety

Opt-in Link Intelligence for Scanly SDK 2.1.0. Barcode decoding stays local.

The browser-safe root exports local analysis, canonicalization, redaction, deterministic scoring, a bounded SHA-256 cache, `UrlSafetyClient`, and `UrlSafetyController`. Nothing subscribes to scanning or connects to the network by default. The `/server` export is Node-only and explicitly unavailable to browser bundlers.

```ts
import { UrlSafetyClient } from "@scanly/url-safety";
const client = new UrlSafetyClient({ endpoint: "/api/url-safety" });
const result = await client.analyze("https://example.com", { mode: "local-only" });
```

```ts
import { createUrlSafetyAnalyzer } from "@scanly/url-safety/server";
const analyzer = createUrlSafetyAnalyzer();
const result = await analyzer.analyze("https://example.com", { mode: "remote" });
```

No verdict guarantees a URL is safe. Scores are heuristic/composite scores, not maliciousness probabilities. LLM is advisory evidence, not an authority. Network modes share the decoded URL and require informed opt-in; credentials belong on the server only.

See [configuration, self-hosting, ScannerSession integration and security limitations](https://github.com/Yangjunjie-Lin/Scanly/blob/main/docs/url-safety.md).
