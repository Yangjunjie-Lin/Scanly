# Testing

## Commands

```bash
npm ci
npm run fixtures:generate
npm run scenarios:generate
npm run lint
npm run typecheck
npm run test:unit
npm run test:symbologies
npm run test:coverage
npm run test
npm run build
npm run build:packages
npm run packages:smoke
npm run packages:tarball
npm run docs:check
npm run test:e2e
npm run test:e2e:chromium
npm run test:e2e:firefox
npm run test:e2e:webkit
npm run benchmark:smoke
npm run benchmark:profiles
npm run benchmark:compare
npm run benchmark:symbologies
```

## Unit and integration tests

Vitest covers frame/stride validation, image primitives, candidate generation/deduplication, task graphs, bounded artifacts, engine/operator/validator registries, scenario compilation/enforcement, semantic parsers, sessions, ownership, Worker message/client behavior, timeout, cancellation, camera lifecycle, and the non-empty success invariant.

Real QR PNG fixtures are decoded through Router with registered jsQR and ZXing engines. Deterministic Data Matrix, PDF417, Code 128, EAN/UPC, GS1, and mixed fixtures exercise the pinned ZXing-C++ reader WASM directly and through the Node Router. Browser smoke tests cover every new format through the persistent Worker in Chromium, Firefox, and WebKit. Coverage gates remain lines/functions/statements >=85% and branches >=70%; generated `dist` output is excluded.

Reliability coverage includes 500 sequential image scans, 500 session create/start/stop/dispose cycles, 500 cancellation/recovery cycles, 500 Worker terminate/recreate cycles, alternating valid/invalid frames, repeated scenario switching, and repeated engine initialization/disposal. These deterministic loops are lifecycle evidence, not a substitute for multi-hour physical-device camera soak testing.

`npm run test:memory -- --iterations=500` runs a local Node soak with exposed GC and writes an ignored observational report. JIT/allocator behavior makes a single heap delta unsuitable as a universal CI leak threshold.

`npm run packages:smoke` imports documented workspace entry points using Node's native ESM resolver. `npm run packages:tarball` packs every publishable workspace, installs the tarballs in a temporary consumer, imports every export, checks declarations and Worker assets, and verifies package contents.

## E2E and accessibility

Playwright starts production `next start`. Chromium runs the complete upload/result/error/state, URL-safety, cancellation/recovery/stale ownership, real Worker instrumentation, camera error, and axe accessibility suite. Firefox and WebKit run the tagged upload/Worker core smoke suite. Camera automation is Chromium-only because CI media-device simulation differs across engines.

## Benchmark gates

- `benchmark:smoke`: curated Router-path functional subset with historical, multiple, cancellation, timeout, and hard-attempt checks.
- `benchmark:profiles`: the complete 63-case manifest for fast, balanced, and robust, with profile-specific immutable baselines and direct recall, exact-payload, false-positive, multi-completeness, average/median/P95 latency, average/P95 attempt, timeout, cancellation, initialization, and environment-compatibility gates.
- `benchmark:compare`: identical-input Node comparison of raw engines and Scanly profiles; it is not a browser-device or commercial SDK comparison.
- `benchmark:symbologies`: the 146-fixture generated Alpha.5 corpus with per-format recall/exactness, confusion, GS1, checksum-negative, mixed completeness, latency, and WASM-memory fields. It does not satisfy the missing project-owned photo gate.

Required canonical fixtures are asserted before use; missing files fail rather than silently returning. Temporary images use OS temporary directories and are cleaned after each suite.
