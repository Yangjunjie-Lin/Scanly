# Scanly SDK v2 foundation — preview

Scanly is a local-first barcode capture SDK foundation with a working browser QR reference application. The v2 alpha adds framework-independent contracts, versioned scenarios, a bounded capture router, deterministic sessions, engine/operator interfaces, semantic parsers, and reusable browser/React packages while preserving the proven QR pipeline. It is not an ML model and has no image-upload backend.

![Next.js 15](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![SDK](https://img.shields.io/badge/SDK-2.0.0--alpha.1-orange)
![License](https://img.shields.io/badge/license-MIT-green)

**Live demo:** [https://qr-decoder-theta.vercel.app](https://qr-decoder-theta.vercel.app)

![Scanly upload decode](docs/screenshot.png)

## Implemented in this branch

- UI-independent frame, result, error, engine, operator, router, and session contracts
- Versioned runtime-validated fast, balanced, and robust scenario profiles
- Web Worker upload decoding with transferable pixel buffers and termination-based cancellation
- Job ownership checks that prevent stale results from overwriting a newer upload
- Top-N regions, deduplication, multi-scale crops, preprocessing, rotations, jsQR, and ZXing fallback
- Per-frame bounded intermediate cache shared by repeated preprocessing/decoder attempts
- Multiple-code completeness contracts rather than “one code found” success
- Local-only semantic parsing for URL, Wi-Fi, vCard, email, telephone, SMS, geo, calendar, and prepared GS1 forms
- Canonical benchmark reports, regression/performance gates, coverage, and cross-browser Playwright checks
- Local-only privacy: no image upload API, storage, account, analytics, or tracking

QR Code Model 2 is the only format currently implemented and tested. Other symbologies in the public capability vocabulary are unsupported, not hidden support claims.

## Internal fixture benchmark

This is Scanly's internal regression suite—not universal accuracy, a third-party comparison, or an ML evaluation. Hard failures stay in the denominator.

<!-- BENCHMARK_SUMMARY_START -->
| Metric | Value |
| --- | ---: |
| Internal fixtures | 54 |
| Generated fixtures | 45 |
| Project-owned photos | 9 |
| Success on fixture suite | **53/54 (98.1%)** on the current 54-case project fixture suite |
| Positive decode recall | **51/52 (98.1%)** |
| Negative false positives | **0/2 (0.0%)** |
| Remaining failure | `14-damaged` |
| Benchmark date | 2026-07-15 |
| Manifest | [fixtures/manifest.json](fixtures/manifest.json) |
| Canonical JSON | [benchmark-results/latest.json](benchmark-results/latest.json) |
<!-- BENCHMARK_SUMMARY_END -->

See [the full benchmark](docs/benchmark.md) and [fixture methodology](docs/testing.md).

## Features

- Camera scanning and uploaded image decoding
- Clear/inverted/small-in-large/damaged/multiple QR fallbacks within bounded attempt and time budgets
- Real cancel, stale-job protection, and recoverable Worker errors
- HTTP/HTTPS-only link actions; all other payloads remain plain text
- 25 MiB and 24-megapixel upload safety limits

## Workspace boundaries

| Workspace | Ownership |
| --- | --- |
| `apps/web-demo` | Next.js reference application; consumes SDK APIs |
| `packages/core` | contracts, router, session, bounded artifacts, QR pipeline |
| `packages/browser` | file loading, Worker ownership, camera source lifecycle |
| `packages/react` | thin React lifecycle adapter |
| `packages/scenario-schema` | scenario v2 types, validation, profiles |
| `packages/parsers` | side-effect-free semantic parsing |
| `packages/benchmark` | benchmark schema, fixture evaluation, gates |
| `engines/jsqr`, `engines/zxing-js` | engine-plugin contract adapters |

- [Architecture](docs/architecture.md)
- [SDK usage](docs/sdk/usage.md)
- [Public API and lifecycle](docs/sdk/public-api.md)
- [Scenarios](docs/scenarios/configuration.md)
- [Decoding pipeline](docs/decoding-pipeline.md)
- [Benchmark methodology](docs/benchmarking/methodology.md)
- [v1 migration](docs/migration/v1-to-v2.md)
- [Maintenance policy](docs/maintenance.md)

## Local development

Verified in CI on Node.js 20 and locally on Node.js 24; the supported maintenance range is Node.js 20–24 with npm 10 or newer.

```bash
git clone https://github.com/Yangjunjie-Lin/Scanly.git
cd Scanly
npm ci
npm run fixtures:generate
npm run scenarios:generate
npm run dev
```

For production-equivalent verification:

```bash
npm run check
npm run test:e2e
npm run benchmark:smoke
npm run benchmark:compare
```

Run `npm run benchmark` after decoding-pipeline or fixture-contract changes.

## Browser support

| Browser | Support |
| --- | --- |
| Chrome / Edge | Camera and upload supported |
| Firefox | Upload supported; camera depends on browser/device permissions |
| Safari / iOS Safari | Upload and camera supported with HTTPS and platform permission constraints |

Automated desktop coverage is not a claim that every browser/device combination has been tested. Camera E2E remains Chromium-only because CI media-device simulation is not stable across all engines.

## Privacy and security

- Images are processed locally and are never sent to an upload API or stored by Scanly.
- The project contains no analytics or user-behavior tracking.
- Camera tracks stop after use or when leaving Camera mode.
- Clipboard writes require an explicit button action and browser permission.
- Benchmark images are repository fixtures: deterministic generated cases or project-owned photos.
- QR payloads render as text; only parsed `http:` and `https:` URLs can enable **Open Link**.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Preview limitations

- Severely damaged or occluded modules may remain undecodable; `14-damaged` is intentionally retained.
- Strong 3D perspective warp may exceed the heuristic pipeline.
- Camera support depends on HTTPS, permissions, browser, and device hardware.
- File and pixel limits reject unusually large images before full RGBA allocation.
- Micro QR, rMQR, Data Matrix, PDF417, Aztec, 1D formats, ZXing-C++ WASM, native bindings, Python, and .NET bindings are not implemented.
- Desktop browser automation is not real iOS/Android device validation; torch, zoom, orientation, and long-running camera behavior still need a physical device lab.
- Corner points, symbology identifiers, and statistically calibrated confidence are not available from the migrated default QR path. Decoder-provided raw bytes are exposed for image scans, while the camera text callback omits them rather than fabricating them.

## Project status

**SDK v2 alpha preview.** The modular foundation and web reference app are implemented and tested, but industrial- or production-readiness for the SDK as a cross-platform product is not claimed. The public API may change before v2 stable under the documented deprecation policy.

## License

[MIT](LICENSE) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)
