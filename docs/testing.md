# Testing

## Commands

```bash
npm ci
npm run fixtures:generate
npm run scenarios:generate
npm run lint
npm run typecheck
npm run test:unit
npm run test:coverage
npm run test
npm run build
npm run build:packages
npm run docs:check
npm run test:e2e
npm run test:e2e:chromium
npm run test:e2e:firefox
npm run test:e2e:webkit
npm run benchmark:smoke
npm run benchmark
npm run benchmark:compare
```

## Unit tests (Vitest)

Cover `@scanly/core` algorithms and contracts: frame/stride validation, grayscale, contrast, invert, thresholds/Otsu, NMS, crop padding, task graphs, bounded artifacts, scenarios, semantic parsers, sessions, Worker messages/ownership, timeout, cancellation, and non-empty success.

Coverage gates: lines/functions/statements ≥85% and branches ≥70% across testable QR, Worker-client, upload-wrapper, and benchmark-contract modules.

## Integration tests

Real QR PNG fixtures decoded through `decodePixelBuffer` (jsQR / ZXing, not mocked away).

Reliability coverage includes 100 repeated image decodes, 100 session create/cancel/dispose cycles, and 100 Worker termination/recreation cycles. This is resource-lifecycle evidence, not a substitute for multi-hour physical-device camera soak testing.

`npm run test:memory -- --iterations=200` runs a local Node soak with exposed GC and writes an ignored observational report. JIT/allocator behavior makes a single heap delta unsuitable as a universal CI leak threshold.

`npm run packages:smoke` imports every documented package entry point through Node's native ESM resolver. Run it after `npm run build:packages`; this catches emitted relative-specifier and export-map defects that a TypeScript or bundler-only build can miss.

## E2E (Playwright)

Starts production `next start`. Chromium runs the complete suite: upload/result/error/state contracts, URL safety, cancellation/recovery/stale ownership, repeated cancellation, real Worker instrumentation, camera error stubs, and axe accessibility states. Firefox and WebKit run the tagged core smoke suite against page load, clear/inverted/multiple upload, real Worker creation, cancellation, post-cancel recovery, and page errors. Camera automation is Chromium-only because CI media-device simulation differs across engines.

## Benchmark gates

- `benchmark:smoke` — curated subset + historical regression/multiple/hard-attempt checks; writes ignored `benchmark-results/smoke.json` and `.csv` artifacts
- full `benchmark` / CI `benchmark.yml` — complete manifest including negative/adversarial cases; the gate checks the historical absolute pass baseline, recall, false positives, zero previously-passing regressions, complete multiple payload sets, attempts, selected hard-fixture caps, and tolerant timing ceilings
- `benchmark:compare` — identical-input Node comparison of raw jsQR, raw ZXing JavaScript, and fast/balanced/robust scenarios; it is not a browser-device or commercial SDK comparison

Required canonical fixtures are asserted before use; missing files fail tests rather than silently returning. Temporary generated test images use OS temporary directories and are cleaned after each suite.
