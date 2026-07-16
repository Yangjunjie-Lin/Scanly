# Public API and lifecycle

## Version policy

- SDK package version: `2.0.0-alpha.3`

`ScanResult.cornerPoints` are always expressed as pixel coordinates in the original normalized frame. ROI offsets, candidate crops, resizing, scale caps, and clockwise decode-attempt rotations are inverted before publication. Invalid or implausibly out-of-frame engine points are omitted.

`ScanResult.orientation`, when present, is an engine-derived clockwise angle relative to the original normalized frame. A preprocessing attempt rotation is debug metadata only and is never exposed as symbol orientation.

Static multi-code scans default to `payload-format-spatial` deduplication. Schema `2.1` also supports `payload`, `payload-format`, and `tracked-instance` policy selection. Geometry-proven separate instances with the same payload remain separate under the default; when geometry is unavailable, the documented fallback is payload plus format identity.
- Scenario schema: `2.0`
- Benchmark report schema: `2.0`
- Engine metadata comes from each registered plugin instance; core contains no decoder version map.

Alpha APIs may change. Before v2 stable, a breaking public change increments the alpha/preview release and receives a migration note. After stable, semantic versioning applies; supported deprecated APIs receive at least one minor-release migration window unless a security fix requires removal.

## Authoritative execution API

`CaptureRouter.scan(NormalizedFrame)` is the low-level execution entry point. `EngineRegistry`, `OperatorRegistry`, `ValidatorRegistry`, and `ScenarioCompiler` are public composition APIs. Applications normally use the browser or Node composition roots; advanced integrations can register a conforming engine or replace an operator without editing Router.

A frame declares `borrowed`, `owned`, or `transferred` ownership. Router releases non-borrowed frames exactly once, including validation, concurrency, cancellation, timeout, engine failure, and internal-error paths. Borrowed buffers remain caller-owned.

## Lifecycle

```text
idle -> initialized -> running -> stopped -> running
                       \-> error
any non-disposed state -> disposed
```

`cancel()` and `stop()` are idempotent. `dispose()` is asynchronous and idempotent; an owned Router waits for engine disposal before its promise resolves. Calling `scan()` before start returns `session_not_running`; using a disposed core session throws `SdkException` containing a typed `SdkError`. The default concurrent policy is `replace`; `reject` returns `concurrent_call_rejected`. Configuration and source changes cancel active work and clear stream duplicate state.

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

`ScanSuccess.results` is a non-empty tuple and `primary` is its first item. `rawText` always remains available. `rawBytes` contains only decoder-provided bytes when requested by the scenario. Upload, Worker, main-thread, and sampled camera frames all use the same result construction path. Corners, orientation, symbology identifiers, track IDs, and quality remain optional because engines do not provide all of them.

When `output.includeAttempts` is enabled, `attempts` contains a bounded, payload-free public record. Debug traces are stage-only, bounded to 256 events, and details are truncated; neither traces nor attempts contain decoded text or pixels.

`heuristicQuality` is intentionally named and includes a definition string. The default QR pipeline does not emit it, and scenarios that request a minimum are rejected. Scanly does not fabricate statistical confidence.

## Supported capability versus vocabulary

The scenario format union reserves identifiers for future formats, but installed default engines report and test only `qr_code` (QR Code Model 2). A scenario requesting uncovered formats returns `unsupported_format` during compilation. Capability metadata, documentation, and tests must change before any other format is claimed.
