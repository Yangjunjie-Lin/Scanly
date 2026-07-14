# Scanly — Browser QR Code Scanner

Scanly decodes QR codes from your camera or uploaded photos entirely in the browser. It uses region detection, ordered image preprocessing, and jsQR + ZXing fallbacks — **heuristic computer vision**, not an ML model.

![Next.js](https://img.shields.io/badge/Next.js-14.2.5-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5.3-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Live demo

**Production:** [https://qr-decoder-theta.vercel.app](https://qr-decoder-theta.vercel.app)

![Scanly upload decode](docs/screenshot.png)

## Current benchmark (canonical)

Generated from `benchmark-results/latest.json` via `npm run benchmark` (do not hand-edit these numbers):

| Metric | Value |
| --- | ---: |
| Fixtures | 52 |
| Success | **51/52 (98.1%)** |
| Average | 0.94s |
| Median | 0.24s |
| P95 | 4.22s |
| Regressions vs pre-upgrade baseline | 0 |

Pre-upgrade baseline (16 fixtures): **12/16 (75%)**. Prior failures fixed: inverted, multiple-codes (primary + secondary), complex-background. Remaining hard failure: severely damaged modules (`14-damaged`).

Full tables: [docs/benchmark.md](docs/benchmark.md)

## Features

- Camera scanning and image upload
- Top-N region candidates with padding / multi-scale retries
- Preprocess fallbacks: contrast, invert, Otsu, thresholds, gamma, sharpen, rotations
- jsQR primary + ZXing backup adapters with attempt telemetry
- Multiple unique QR results when present
- Cancel / reset for upload jobs; AbortController prevents stale overwrites
- Local-only processing — images are not uploaded or stored

## Tech stack

Next.js 14 · React 18 · TypeScript · jsQR · @zxing/browser + @zxing/library · Sharp (fixtures/benchmarks)

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

## Privacy

- Decoding runs in your browser (or locally for CLI benchmarks).
- Upload images stay on device; there is no image upload API.
- Camera streams are stopped when scanning ends or the tab changes.

## Known limitations

- Severely damaged / occluded modules may still fail (`14-damaged` in the fixture set).
- Extremely large images are capped by pixel and attempt budgets.
- Camera mode depends on HTTPS (or localhost) and browser permission prompts.
- Mild perspective skew is handled better than strong 3D warp.

## License

MIT

## Author

[Yangjunjie Lin](https://github.com/Yangjunjie-Lin)
