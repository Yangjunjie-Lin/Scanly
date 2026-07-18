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

