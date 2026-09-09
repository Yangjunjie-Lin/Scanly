# Supported barcode formats

Scanly SDK v2.0.1 exposes an explicit eight-format public contract. The default scenario remains `formats: ["qr_code"]` for compatibility; applications opt into additional formats or select a multi-format scenario.

| Format | Public ID | Class | Default engine support | Notes |
| --- | --- | --- | --- | --- |
| QR Code Model 2 | `qr_code` | matrix | ZXing-C++ WASM, jsQR, ZXing-JS | JavaScript fallback engines are QR-only |
| Data Matrix ECC 200 | `data_matrix` | matrix | ZXing-C++ WASM | GS1 metadata is exposed when reported |
| PDF417 | `pdf417` | stacked | ZXing-C++ WASM | Standard PDF417 |
| Code 128 | `code_128` | linear | ZXing-C++ WASM | GS1-128 metadata is preserved |
| EAN-13 | `ean_13` | linear | ZXing-C++ WASM | Valid check digit required; leading zeroes preserved |
| EAN-8 | `ean_8` | linear | ZXing-C++ WASM | Valid check digit required |
| UPC-A | `upc_a` | linear | ZXing-C++ WASM | Format identity is not relabeled as EAN-13 |
| UPC-E | `upc_e` | linear | ZXing-C++ WASM | Original payload is preserved; expansion is optional metadata |

Core owns the format vocabulary and selection contract but does not register a decoder. Browser and Node compose jsQR, the lazy ZXing-C++ WASM engine, and ZXing-JS. A format with no registered supporting engine fails with `unsupported_format`.

```ts
const router = createNodeCaptureRouter({
  formats: ["qr_code", "data_matrix", "pdf417", "code_128"],
});
```

Deferred formats—including Micro QR, rMQR, Aztec, Micro PDF417, DotCode, MaxiCode, GS1 DataBar/Composite, postal codes, Codabar, Code 39, Code 93, and ITF—are not part of the v2.0.x public union. Upstream ZXing support does not make a format public.

Direct Part Mark Data Matrix uses the opt-in `dpm-experimental` recovery profile. It is not DPM or industrial certification. Difficult, occluded, low-contrast, or strongly distorted symbols can still fail.

All decoding is local in Browser, Worker, Node, iOS, and Android runtimes. Historical format-development evidence is preserved in [SDK v2 development history](history/sdk-v2-development-history.md) and the release evidence directories.

Curated open-license camera photographs satisfy the Beta 1 photo gate but do not constitute physical-camera/device evidence or project ownership.
