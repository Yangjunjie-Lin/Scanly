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
npm run benchmark:smoke
npm run benchmark
```

## Unit tests (Vitest)

Cover pure `lib/qr` algorithms: grayscale, contrast, invert, thresholds/Otsu, NMS, crop padding, clamp, attempt order, URL detection, timeout, cancellation, empty buffers.

Target: ≥80% coverage on `lib/qr` core modules.

## Integration tests

Real QR PNG fixtures decoded through `decodePixelBuffer` (jsQR / ZXing, not mocked away).

## E2E (Playwright)

Starts production `next start`, exercises Upload flow (clear, URL, invert, small-in-large, multiple, error, race), plus camera permission/device stubs.

## Benchmark gates

- `benchmark:smoke` — curated subset + regression vs `benchmark-results/baseline-pre-upgrade.json`
- full `benchmark` / CI `benchmark.yml` — complete manifest; fails on regressions or &lt;90% success rate when `--gate` is set
