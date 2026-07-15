# Scanly — private-first browser QR scanner

Scanly is a feature-complete, privacy-first QR scanner for camera and uploaded images. Its layered, heuristic computer-vision pipeline runs locally in the browser; it is not an ML model and has no upload backend.

![Next.js 14](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Benchmark](https://img.shields.io/badge/internal%20benchmark-51%2F52-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

**Live demo:** [https://qr-decoder-theta.vercel.app](https://qr-decoder-theta.vercel.app)

![Scanly upload decode](docs/screenshot.png)

## Why Scanly

- Web Worker upload decoding with transferable pixel buffers and termination-based cancellation
- Job ownership checks that prevent stale results from overwriting a newer upload
- Top-N regions, deduplication, multi-scale crops, preprocessing, rotations, jsQR, and ZXing fallback
- Multiple-code completeness contracts rather than “one code found” success
- Canonical benchmark reports, regression/performance gates, coverage, and cross-browser Playwright checks
- Local-only privacy: no image upload API, storage, account, analytics, or tracking

## Internal fixture benchmark

This is Scanly's internal regression suite—not universal accuracy, a third-party comparison, or an ML evaluation. Hard failures stay in the denominator.

<!-- BENCHMARK_SUMMARY_START -->
| Metric | Value |
| --- | ---: |
| Internal fixtures | 52 |
| Generated fixtures | 43 |
| Project-owned photos | 9 |
| Success on fixture suite | **51/52 (98.1%)** on the current 52-case project fixture suite |
| Remaining failure | `14-damaged` |
| Benchmark date | 2026-07-14 |
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

## Architecture and testing

The Upload tab passes a transferable RGBA buffer to a dedicated Worker; the Worker runs the same core pipeline used by Vitest integration tests and the benchmark. Camera mode uses `@zxing/browser` directly because it owns the live media stream.

- [Architecture](docs/architecture.md)
- [Decoding pipeline](docs/decoding-pipeline.md)
- [Testing and benchmark gates](docs/testing.md)
- [Maintenance policy](docs/maintenance.md)

## Local development

Verified in CI on Node.js 20 and locally on Node.js 24; the supported maintenance range is Node.js 20–24 with npm 10 or newer.

```bash
git clone https://github.com/Yangjunjie-Lin/Scanly.git
cd Scanly
npm ci
npm run fixtures:generate
npm run dev
```

For production-equivalent verification:

```bash
npm run check
npm run test:e2e
npm run benchmark:smoke
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

## Limitations

- Severely damaged or occluded modules may remain undecodable; `14-damaged` is intentionally retained.
- Strong 3D perspective warp may exceed the heuristic pipeline.
- Camera support depends on HTTPS, permissions, browser, and device hardware.
- File and pixel limits reject unusually large images before full RGBA allocation.

## Project status

**Stable · feature-complete · production deployed · maintenance mode.** Future work is limited to security, browser/API compatibility, dependency support, reproducible decoding improvements, and real bug reports.

## License

[MIT](LICENSE) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)
