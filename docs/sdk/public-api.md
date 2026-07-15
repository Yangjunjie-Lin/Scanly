# Public API and lifecycle

## Version policy

- SDK package version: `2.0.0-alpha.1`
- Scenario schema: `2.0`
- Benchmark report schema: `2.0`
- Engine metadata uses the underlying engine version (`jsqr` 1.4.0, ZXing JavaScript 0.21.3).

Alpha APIs may change. Before v2 stable, a breaking public change increments the alpha/preview release and receives a migration note. After stable, semantic versioning applies; supported deprecated APIs receive at least one minor-release migration window unless a security fix requires removal.

## Lifecycle

```text
idle → initialized → running → stopped → running
                    ↘ error
any non-disposed state → disposed
```

`cancel()`, `stop()`, and `dispose()` are idempotent. Calling `scan()` before start returns `session_not_running`; using a disposed core session throws `SdkException` containing a typed `SdkError`. The default concurrent policy is `replace`; `reject` returns `concurrent_call_rejected`.

## Error taxonomy

Public consumers switch on `SdkError.code`, never message text:

| Area | Codes |
| --- | --- |
| Decode/input | `no_symbol_found`, `unsupported_format`, `invalid_image` |
| Resource | `resource_limit_exceeded`, `timeout`, `cancelled` |
| Runtime/engine | `worker_initialization_failure`, `engine_initialization_failure`, `engine_execution_failure` |
| Camera/source | `camera_permission_denied`, `camera_unavailable`, `source_disconnected`, `unsupported_browser_capability` |
| Configuration | `malformed_scenario`, `invalid_configuration` |
| Lifecycle/internal | `session_not_running`, `session_disposed`, `concurrent_call_rejected`, `internal_invariant_failure` |

## Result model

`ScanSuccess.results` is a non-empty tuple and `primary` is its first item. `rawText` always remains available. `rawBytes` contains decoder-provided bytes for the migrated image pipeline when requested by the scenario; text-only camera callbacks omit it. Corners, orientation, symbology identifiers, track IDs, and quality remain optional because engines do not provide all of them.

`heuristicQuality` is intentionally named and includes a definition string. The default QR pipeline does not currently emit it; Scanly does not fabricate statistical confidence.

## Supported capability versus vocabulary

The scenario format union reserves identifiers for future formats, but installed default engines report and test only `qr_code` (QR Code Model 2). A scenario without QR returns `unsupported_format`. Capability metadata, documentation, and tests must change before any other format is claimed.
