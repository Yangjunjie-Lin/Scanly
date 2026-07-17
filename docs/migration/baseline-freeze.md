# v1 baseline freeze (before SDK v2 changes)

Recorded on 2026-07-15 on branch `architecture/sdk-v2-foundation` before implementation. `git status --short --branch` showed the target branch and no existing user changes.

## Verified baseline

| Gate | Result |
| --- | --- |
| repository quality contracts | pass |
| lint | pass, zero warnings/errors |
| TypeScript | pass |
| Vitest | 70/70 tests, 10/10 files |
| coverage | 90.66% statements, 81.46% branches, 94.38% functions, 90.66% lines |
| Next.js 14 production build | pass |
| Playwright | 38/38 across configured Chromium, Firefox, WebKit projects |
| full fixture benchmark | 51/52 positive cases (98.1%); retained failure `14-damaged` |
| latency | average 118.85 ms, median 77 ms, P95 317 ms (Node domain) |
| attempts | average 11.48, median 10, P95 43 |

## Baseline architecture and debt

- Next.js/React owned product state and live camera decoding.
- Reusable upload decoding existed under `lib/qr`, but no publishable package, normalized frame, session, Router, operator/engine contract, scenario schema, or public SDK result model existed.
- At baseline, upload used a strong Worker ownership/cancellation design while camera used a separate direct ZXing Browser flow. The v2 corrective migration replaced both with normalized frames routed through the shared capture runtime.
- Pipeline settings were partial TypeScript configuration without versioned runtime validation.
- Benchmark lacked negative samples, false-positive rate, time-to-first-result, runtime/schema labels, and identical-input engine/scenario comparison.
- Current format implementation was QR only; no native/WASM binding existed.

The migration moved the working QR implementation rather than cloning it, kept every original fixture and expected payload, and retained the hard failure.
