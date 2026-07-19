# Alpha.5 Symbologies

Scanly SDK v2 Alpha.5 is a privacy-first preview. Public format selection is explicit; the default scenario remains `formats: ["qr_code"]`.

| Format | Class | Primary engine | Fallback | Notes |
| --- | --- | --- | --- | --- |
| `qr_code` | matrix | ZXing-C++ WASM | jsQR, ZXing-JS | Model 2 only; existing QR suite remains the regression denominator |
| `data_matrix` | matrix | ZXing-C++ WASM | none | ECC 200; GS1 is exposed as metadata when FNC1 is reported |
| `pdf417` | stacked | ZXing-C++ WASM | none | Standard PDF417; Macro/Micro PDF417 and AAMVA parsing are deferred |
| `code_128` | linear | ZXing-C++ WASM | none | Code sets A/B/C; GS1-128 is represented with GS1 metadata |
| `ean_13` | linear | ZXing-C++ WASM | none | 13 digits and valid check digit required; leading zeroes preserved |
| `ean_8` | linear | ZXing-C++ WASM | none | 8 digits and valid check digit required |
| `upc_a` | linear | ZXing-C++ WASM | none | 12 digits and valid check digit required; never relabeled as EAN-13 |
| `upc_e` | linear | ZXing-C++ WASM | none | Original 8-digit payload preserved; expansion is optional metadata |

Deferred formats include Micro QR, rMQR, Aztec, Micro PDF417, DotCode, MaxiCode, GS1 DataBar/Composite, postal codes, Codabar, Code 39, Code 93, ITF, and DPM-specific modes. Internal ZXing support does not make a format public.

All decoding is local in Browser, Worker, and Node runtimes. No image upload, cloud decoder, mutable WASM download, or telemetry path is part of Alpha.5.

## Generated development evidence

The dedicated corpus has 100 single-format positives, 12 mixed positives, and 34 format-specific negatives. The table below counts expected results, including mixed fixtures; it is development evidence from `npm run benchmark:symbologies`, not an immutable Alpha.5 baseline.

| Format | Single positives | Expected results | Exact results | Recall | False positives |
| --- | ---: | ---: | ---: | ---: | ---: |
| QR Code | mixed only | 4 | 4 | 100.0% | 0 |
| Data Matrix | 24 | 28 | 26 | 92.9% | 0 |
| PDF417 | 20 | 23 | 21 | 91.3% | 0 |
| Code 128 | 24 | 31 | 29 | 93.5% | 0 |
| EAN-13 | 8 | 11 | 10 | 90.9% | 0 |
| EAN-8 | 8 | 9 | 8 | 88.9% | 0 |
| UPC-A | 8 | 9 | 8 | 88.9% | 0 |
| UPC-E | 8 | 9 | 8 | 88.9% | 0 |

Clean generated fixtures pass 15/15; difficult single-format fixtures pass 75/85; mixed fixtures pass 12/12. The maintained Alpha.5 negative corpus has zero accepted results.

## Release gates

`npm run benchmark:symbologies -- --gate` evaluates every required Alpha.5 gate and exits nonzero on any failure (not only false positives). Canonical candidate mode additionally requires a clean repository and a complete project-owned real-photo corpus.

## Project-owned real photographs

Alpha.5 Evidence Freeze requires at least 12 authentic project-owned photographs (minimum 3 per major family: Data Matrix, PDF417, Code 128, EAN/UPC). Capture instructions and the empty integration manifest live under [fixtures/alpha5/project-photos/](../fixtures/alpha5/project-photos/README.md).

Until those assets are present, final Evidence Freeze remains blocked with `BLOCKED_REAL_PHOTO_INPUT`.
