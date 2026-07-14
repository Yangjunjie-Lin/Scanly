# Testing

## Commands

```bash
npm ci
npm run fixtures:generate
npm run lint
npm run typecheck
npm run test:unit
npm run test:coverage
npm run test
npm run build
npm run test:e2e
npm run test:e2e:chromium
npm run test:e2e:firefox
npm run test:e2e:webkit
npm run benchmark:smoke
npm run benchmark
```

## Unit tests (Vitest)

Cover pure `lib/qr` algorithms: grayscale, contrast, invert, thresholds/Otsu, NMS, crop padding, clamp, attempt order, URL detection, timeout, cancellation, empty buffers.

Coverage gates: lines/functions/statements ≥85% and branches ≥70% across testable QR, Worker-client, upload-wrapper, and benchmark-contract modules.

## Integration tests

Real QR PNG fixtures decoded through `decodePixelBuffer` (jsQR / ZXing, not mocked away).

## E2E (Playwright)

Starts production `next start`. Chromium runs the complete suite: upload/result/error/state contracts, URL safety, cancellation/recovery/stale ownership, repeated cancellation, real Worker instrumentation, camera error stubs, and axe accessibility states. Firefox and WebKit run the tagged core smoke suite against page load, clear/inverted/multiple upload, real Worker creation, cancellation, post-cancel recovery, and page errors. Camera automation is Chromium-only because CI media-device simulation differs across engines.

## Benchmark gates

- `benchmark:smoke` — curated subset + historical regression/multiple/hard-attempt checks; writes ignored `benchmark-results/smoke.json` and `.csv` artifacts
- full `benchmark` / CI `benchmark.yml` — complete manifest; the gate checks the historical absolute pass baseline, at least `max(98%, baseline rate)`, zero previously-passing regressions, complete multiple payload sets, average/P95 attempts, selected hard-fixture attempt caps, and tolerant 3× timing ceilings

Required canonical fixtures are asserted before use; missing files fail tests rather than silently returning. Temporary generated test images use OS temporary directories and are cleaned after each suite.
