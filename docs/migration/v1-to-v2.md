# Migrating from Scanly v1

## Import ownership

| v1 internal path | v2 owner |
| --- | --- |
| `lib/qr/decode-pipeline` | `@scanly/core/qr` |
| `lib/qr/worker/*` | `@scanly/browser` |
| `lib/qr/decode-upload` | `BrowserCaptureSession.scanFile()` |
| React camera/ZXing ownership | `BrowserCameraSource` |
| free-form pipeline config | validated `ScenarioDefinition` |

The legacy implementation was moved, not copied: there is one QR pipeline under `packages/core/src/qr`. The web demo now stores `ScanResult` and switches on `SdkError.code`.

## Result changes

- `payload` becomes `rawText` in the public SDK result.
- decoder/preprocess/candidate fields are nested or expanded.
- errors use the stable SDK taxonomy (`no_symbol_found`, `resource_limit_exceeded`, and so on).
- success remains compile-time and runtime non-empty.

Direct low-level QR APIs remain available from `@scanly/core/qr` during the alpha for benchmarks and advanced migration. They are not the preferred long-term application API and may receive a deprecation window before v2 stable.
