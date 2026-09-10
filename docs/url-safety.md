# Link Intelligence / URL safety

Scanly 2.1.0 adds `@scanly/url-safety` as an opt-in second trust boundary. The scanner, Worker, FrameScheduler and CaptureRouter never depend on this package. Images, barcode pixels and camera frames are never inputs to URL intelligence. The existing `@scanly/parsers` structured payload is the only scan integration entrance; text, WiFi and vCard payloads do not trigger safety calls.

LLM is advisory evidence, not an authority. No verdict guarantees a URL is safe.

## Privacy and data flow

| Explicit mode | Local rules | Configured reputation services | Destination inspection | LLM evidence |
| --- | --- | --- | --- | --- |
| Disabled (controller/UI default) | No | No | No | No |
| `local-only` (analyze default) | Yes | No | No | No |
| `reputation-only` | Yes | Yes | No | No |
| `remote` | Yes | Yes | Server only | No |
| `ai-assisted` | Yes | Yes | Server only | Sanitized, bounded metadata/text |

Selecting a higher mode explicitly authorizes the indicated cumulative layers. No persisted opt-in is inferred. The demo backend also requires `SCANLY_URL_SAFETY_ENABLED=true` to accept network modes. Without configuration, local-only works entirely in the browser. Disabling analysis cancels owned work.

Reputation adapters with `fullUrlRequired=true` receive the full decoded HTTP(S) URL, minus fragment. Both included adapters need this for exact URL lookup. Other adapters receive query-redacted URLs by default. The destination receives its meaningful path/query. Do not enable network modes for token-bearing or confidential links without accepting this disclosure. Embedded username/password URLs are never shared by the server analyzer. URL fragments are never transmitted.

Display URLs, redirect chains and local evidence redact query values and remove userinfo/fragments. Cache keys use SHA-256 of the private normalized URL; modes are separate namespaces. Cache values are sanitized results, TTL defaults to 15 minutes (partial results at most 5 seconds), capacity 256. Results are cloned per caller. Concurrent calls share a flight; cancelling one subscriber does not cancel others, and the last cancellation aborts the flight. Configure separate analyzer/cache instances for different tenants or policies. Do not use one cache across different provider/security configurations.

The library emits no logs or analytics. Safe diagnostic fields include hostname, signal IDs, risk level, provider status, latency and URL hash. Never log request bodies, page HTML, query values, keys, cookies, headers or raw provider errors. Page text may contain personal data; sanitization is best-effort, not an anonymization guarantee. AI mode is explicit consent to share that bounded text.

## Local rules and normalization

`normalizeUrl` uses WHATWG URL parsing, lowercase scheme/ASCII host, canonical default ports, preserved path and query order/duplicates, and no fragment. Deterministic WHATWG query serialization deliberately does not sort parameters: changing order can invalidate signed URLs or alter server semantics. Punycode decoding retains both ASCII and Unicode hostnames. IDN, mixed scripts, high entropy, many/random subdomains, shorteners, weak TLD signals, configured brand mismatches, nested/encoded redirect parameters, credential-related paths and executable extensions are contextual signals, not proof of maliciousness. The URL ceiling is 16 KiB; “long URL” starts at 2 KiB.

The small known-brand domain list is a heuristic, not an exhaustive trademark or public-suffix registry. A legitimate regional brand domain can produce a warning. There is no domain-age claim: no WHOIS source is configured. Homograph detection is approximate, not a complete Unicode confusables implementation.

## Network security / SSRF model

`SafeRemoteFetcher` runs only on Node. Browser imports of `/server` are blocked by conditional exports. Never `fetch` the scanned URL from a browser.

Only HTTP/HTTPS and ports 80/443 are accepted. Userinfo, local/private-like hostnames and all non-global IP ranges are blocked. Every A and AAAA answer must be public. This conservative policy rejects IPv4 private, loopback, link-local/metadata, carrier-grade NAT, unspecified, multicast, reserved, documentation and benchmarking ranges; IPv6 mapped addresses, non-global-unicast, ULA, link-local, multicast, unspecified, transition, documentation and special-purpose ranges are blocked too. Encoded IPv4 variants pass through WHATWG canonicalization before IP validation.

The HTTP connection uses the validated **numeric IP**, with the original Host and TLS server name and certificate verification. There is no second DNS lookup, shared agent/socket, proxy environment inheritance, cookie jar, browser headers or user authorization. DNS queries may complete in the OS after cancellation, but cannot start a connection after the bounded signal has expired. All redirects are manual; each hop revalidates URL, DNS and every IP. The cap is three redirects (four requests).

Inspection is GET-only, with fixed headers, no JavaScript/browser execution and no subresource loads. The total DNS/redirect/body budget is 5 seconds by default (hard ceiling 8 seconds); body cutoff is streaming at 512 KiB (hard ceiling 1 MiB). Headers are capped at 16 KiB. Content encoding must be identity. Only HTML, XHTML and plain text are read; other media record metadata and close the stream. Nothing is executed or written as a downloaded executable.

HTML uses a non-executing parser with a 50,000-node traversal budget, 20,000-character text sample, 512-character title/description and capped hostname lists. Script/style/template content and long encoded blobs are discarded. “Visible text” is an approximate static extraction, not rendered CSS visibility. It may miss JavaScript-rendered attacks, external CSS, non-UTF-8 content, client-side redirects or personalized pages. A technical snapshot is not a malware sandbox or safety certification.

For production defense in depth, run inspection in a separate unprivileged service with an egress firewall denying private/special ranges, no internal service credentials, no filesystem privileges beyond runtime needs, resource limits, and no outbound proxy. Monitor IANA special-purpose allocations and update the conservative IP policy as needed. Do not allow a custom `remoteFetcher` from untrusted input: that extension replaces the security boundary and must independently satisfy these controls.

## Provider configuration / self-hosting

```ts
import {
  createUrlSafetyAnalyzer, createUrlSafetyHandler,
  GoogleWebRiskProvider, VirusTotalProvider,
} from "@scanly/url-safety/server";

const analyzer = createUrlSafetyAnalyzer({
  reputationProviders: [
    new GoogleWebRiskProvider(process.env.SCANLY_WEB_RISK_API_KEY),
    new VirusTotalProvider(process.env.SCANLY_VIRUSTOTAL_API_KEY),
  ],
  policy: { totalTimeoutMs: 20_000, reputationTimeoutMs: 2_000, remoteTimeoutMs: 5_000, aiTimeoutMs: 10_000 },
});
export const POST = createUrlSafetyHandler({
  analyzer,
  allowedOrigins: ["https://your-app.example"],
  allowedModes: ["local-only", "reputation-only", "remote"],
});
```

Keys must be server environment variables, never `NEXT_PUBLIC_*`, committed `.env`, request parameters or browser bundles. No provider is required. Missing keys yield `not_configured`; failures yield partial analysis without failing barcode scanning. Google Web Risk reports MALWARE, SOCIAL_ENGINEERING and UNWANTED_SOFTWARE. A negative lookup is only “not known malicious,” never “known safe.” VirusTotal only looks up existing reports; report-not-found is unavailable. It never submits or rescans. VT positive engine votes use the lower UNWANTED_SOFTWARE policy floor, not an invented definitive malware classification. To support submissions, implement an explicitly configured adapter and return `operation: "submission"`; obtain separate consent and document its retention/quota/privacy terms.

The demo exposes `/api/url-safety`, with no wildcard CORS, mandatory same-origin Origin (or configured `SCANLY_URL_SAFETY_ORIGIN`), JSON-only structured validation, a 24 KiB streaming request ceiling, timeout, request cancellation, 30 requests/minute global process limit and four concurrent requests. Network requests are denied unless the server explicitly enables them. A process-local rate limiter is **not** sufficient across multiple instances or serverless cold starts. Production hosts must add authenticated access, a shared rate limiter, upstream body/time limits and egress controls. Forwarded client-IP headers are deliberately not trusted as identity. No permissive CORS fallback is provided.

## Vendor-neutral LLM adapter and prompt injection

```ts
import { JsonLlmSafetyProvider } from "@scanly/url-safety/server";

const llmProvider = new JsonLlmSafetyProvider({
  id: "your-provider", model: "your-model", timeoutMs: 10_000,
  complete: async ({ system, data, schema, model, signal }) => {
    // Implement your provider's server SDK here using SCANLY_LLM_API_KEY.
    // Send `system` as the trusted policy, `data` as a JSON data message,
    // and `schema` as strict structured output. Supply NO tools.
    // Return ONLY the model's JSON string; do not extract arbitrary prose.
    return yourServerOnlyProvider.completeJson({ system, data, schema, model, signal });
  },
});
```

The repository intentionally does not pick an LLM vendor or wire a credential to an assumed API protocol. Add this trusted transport to `createUrlSafetyAnalyzer({ llmProvider, ... })` on the server to enable AI. In the stock demo, AI is `not_configured`, not a mocked successful AI verdict. The transport must have no agent tools, browsing, shell, network-tool, filesystem or key-retrieval capabilities. It must not promote page content to system/developer messages. The transport itself necessarily talks to its configured provider; that is not a model-callable tool.

The immutable system policy identifies remote pages as untrusted evidence. The structured data fields are `urlFeatures`, `reputationSignals`, `remotePageMetadata`, and `visibleTextExcerpt`. Scripts/styles and URL query values are removed, including echoed exact query values. Adversarial instructions remain plain evidence in a data field. Schema validation rejects extra fields, missing fields, non-JSON prose, invalid enum/score and >20-point AI contribution. API failures, 429/500, timeouts and invalid output mark AI unavailable; completed higher-authority evidence is preserved. Provider/model/latency metadata is retained; raw errors, API keys and chain-of-thought are not.

A schema and prompt cannot guarantee that a model resists every semantic manipulation. The architecture limits the effect: no tools/secrets in the model context, no action execution, strict contribution bounds and deterministic authority precedence. Do not market prompt-injection tests as proof of universal model immunity.

## Risk semantics

Authority tiers: (1) threat intelligence; (2) network/security facts; (3) technical page evidence; (4) lexical heuristics; (5) AI interpretation. LLM contribution is nonnegative and capped at 20; it cannot lower a higher-tier threat. Local contribution is capped at 45. Google malware sets at least 85, social engineering at least 70, unwanted software at least 40. Password inputs and external form actions add technical evidence, but are not themselves proof of fraud.

Scores are composite heuristics, not probabilities: 0–19 low, 20–39 medium, 40–69 high, 70–100 critical. Zero with insufficient/cancelled evidence is unknown. `safe` is reserved in the public type; this implementation never emits it because no strict allow policy is configured. `complete` means the selected analysis finished, not that a page is safe. `partial` means requested evidence is missing; completed observations remain available. `recheck_later`, `verify_domain`, `do_not_enter_credentials`, and other recommendations are guidance, not guarantees.

## Browser and ScannerSession integration

```ts
import { UrlSafetyClient, UrlSafetyController } from "@scanly/url-safety";

const client = new UrlSafetyClient({ endpoint: "/api/url-safety" });
const safety = new UrlSafetyController(client, (state) => renderSafetyState(state));
const detach = safety.attach(scannerSession); // remains disabled
// Only following explicit user consent:
safety.configure("remote");
// scannerSession.onResult is independent and never awaits analysis.
// When the consumer ends ownership:
detach(); safety.dispose(); client.dispose();
```

Only confirmed/emitted events are eligible. `ScannerSession` events expose decoded text rather than `ScanResult.structuredPayload`, so the adapter calls the **existing** semantic parser after confirmation, then gates on `url` or `gs1-digital-link`. It never parses frames or raw detection events. For upload `ScanOutcome`, call `safety.accept(outcome.primary.structuredPayload)` after publishing the barcode result.

Public states: idle, queued, analyzing, complete, partial, failed, cancelled. Lifecycle generation suppresses A's late result after B. Session stop/pause/failure cancels owned work; dispose detaches. UI results use separate state from barcode results. The demo's single-shot scanner stops camera acquisition after emitting the barcode; the result panel owns the subsequent analysis. Explicit stop/pause, new result, mode change, reset or unmount cancels that result-panel work.

There is never automatic navigation. Low risk offers a user action; medium/unknown requires a warning. High/critical offers a conspicuous warning and a non-primary “Open anyway” confirmation. New windows use `noopener,noreferrer`.

## Verification

Run `npm run test:url-safety`, `npm run test:url-safety:ssrf`, `npm run url-safety:security` and `npm run benchmark:url-safety`, plus all normal scanner/package/API/browser gates. Unit provider and transport fixtures are deterministic and do not contact suspicious sites. They are not live-provider qualification or physical-device evidence. Historical 2.0.0/2.0.1 manifests and artifacts are immutable; new release claims require fresh 2.1.0 qualification.
