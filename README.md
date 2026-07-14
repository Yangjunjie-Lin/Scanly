# Scanly — Browser QR Code Scanner

Scanly decodes QR codes from your camera or uploaded photos entirely in the browser. It uses region detection, ordered image preprocessing, and jsQR + ZXing fallbacks — **heuristic computer vision**, not an ML model.

![Next.js](https://img.shields.io/badge/Next.js-14.2.5-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5.3-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Live demo

**Production:** [https://qr-decoder-theta.vercel.app](https://qr-decoder-theta.vercel.app)

![Scanly upload decode](docs/screenshot.png)

## Internal fixture benchmark (canonical)

These numbers come from `benchmark-results/latest.json` via `npm run benchmark`. They measure **Scanly's internal regression fixture suite** — not a claim about all real-world QR images, not a fair comparison to third-party scanners, and not an industry-leading claim.

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

Full tables: [docs/benchmark.md](docs/benchmark.md)

Hard-case fixtures are retained even when they fail. This suite mixes deterministic generated images and project-owned photos — it is **not** an estimate of universal decode success rate.

## Features

- Camera scanning and image upload (upload decoding runs in a **Web Worker** — UI stays responsive)
- Top-N region candidates with padding / multi-scale retries and deduplication
- Preprocess fallbacks: contrast, invert, Otsu, thresholds, gamma, sharpen, rotations
- jsQR primary + ZXing backup adapters with attempt telemetry
- Multiple unique QR results when present (complete required-payload contract in benchmarks)
- **In-flight Cancel** terminates the worker within ~2s; stale job results are ignored
- Local-only processing — images are not uploaded or stored

## Tech stack

Next.js 14 · React 18 · TypeScript · jsQR · @zxing/browser + @zxing/library · Web Worker · Sharp (fixtures/benchmarks)

## Local development

```bash
git clone https://github.com/Yangjunjie-Lin/Scanly.git
cd Scanly
npm ci
npm run fixtures:generate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build
npm start
```

## Tests & quality gates

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:coverage
npm run test:e2e
npm run benchmark:smoke
npm run benchmark
```

Details: [docs/testing.md](docs/testing.md) · Architecture: [docs/architecture.md](docs/architecture.md) · Pipeline: [docs/decoding-pipeline.md](docs/decoding-pipeline.md)

Tests may force a decoder with `config.decoders` / `decoderOrder`; production defaults remain jsQR first with ZXing fallback.

## Privacy

- Decoding runs in your browser (upload pipeline in a dedicated Worker thread).
- Upload images stay on device; there is no image upload API.
- Camera streams are stopped when scanning ends or the tab changes.

## Known limitations

- Severely damaged / occluded modules may still fail (`14-damaged` in the fixture set).
- Extremely large images are capped by pixel and attempt budgets.
- Camera mode depends on HTTPS (or localhost) and browser permission prompts.
- Mild perspective skew is handled better than strong 3D warp.

## License

[MIT License](LICENSE)

## Author

[Yangjunjie Lin](https://github.com/Yangjunjie-Lin)
