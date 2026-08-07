# Public API and lifecycle

## Version policy

- SDK package version: `2.0.0-beta.1` (Beta 1 development preview)

`ScanResult.cornerPoints` are always expressed as pixel coordinates in the original normalized frame. ROI offsets, candidate crops, resizing, scale caps, and clockwise decode-attempt rotations are inverted before publication. Invalid or implausibly out-of-frame engine points are omitted.

`ScanResult.orientation`, when present, is an engine-derived clockwise angle relative to the original normalized frame. A preprocessing attempt rotation is debug metadata only and is never exposed as symbol orientation.

Static multi-code scans default to `payload-format-spatial` deduplication. Schema `2.1` also supports `payload`, `payload-format`, and `tracked-instance` policy selection. Geometry-proven separate instances with the same payload remain separate under the default; when geometry is unavailable, the documented fallback is payload plus format identity.

## Beta 1 real-time scanner runtime

`@scanly/browser` exposes `ScannerSession` for continuous camera work. A session owns the camera source, persistent decode Worker, frame scheduler, temporal candidate store, ROI hint, repeat policy, cancellation generation, and diagnostics; a React adapter should only render state and subscribe to events.

The runtime pipeline is bounded and latest-frame based:

```text
CameraFrameSource -> FrameScheduler -> FrameQualityAnalyzer
  -> Fast/Balanced/Robust escalation -> temporal confirmation
  -> RepeatSuppressor -> ScanEvent("emitted")
```

`FrameScheduler` permits one expensive decode and retains only the newest pending frame. `FrameQualityAnalyzer` reports heuristic blur, exposure, glare, contrast, edge density, and usability signals; unusable frames are admitted periodically as probes so a heuristic cannot permanently block a valid code. `TemporalCandidateStore` supports `immediate`, `confirm-two`, and `adaptive` confirmation. `RepeatSuppressor` supports `allow`, `cooldown`, `once-per-session`, and `physical-instance`; geometry and disappearance are used to distinguish equal payloads on separate physical symbols.

`DeterministicFrameSequenceSource` is the CI camera simulator. `MediaStreamCameraFrameSource` is the browser-only media adapter. `CameraCapabilityController` feature-detects torch, zoom, and focus and returns typed `CapabilityResult` failures when a browser or track does not support a capability. The public `ScannerSessionStatistics` includes TTFD, TTFC, effective decode FPS, admission/drop counts, profile distribution, duplicate suppression, Worker counts, and controlled-memory cleanup.

Beta 1 development evidence is collected by `npm run benchmark:realtime`; it runs 20 deterministic sequence scenarios and a 10,000-frame soak. These numbers are development baselines, not production or physical-device certification.
- Scenario schema: `2.1`
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

Alpha.5 publicly supports `qr_code`, `data_matrix`, `pdf417`, `code_128`, `ean_13`, `ean_8`, `upc_a`, and `upc_e`. Deferred ZXing formats are not in the public union. jsQR and ZXing-JS report QR-only capabilities; the pinned ZXing-C++ WASM engine reports the eight verified mappings. A scenario requesting a format with no registered engine returns `unsupported_format` during compilation.

`FormatSelection` accepts a non-empty list, normalizes duplicates, rejects deferred/unknown formats, and is propagated through Router, Worker, Node, and native decode options. QR-only remains the default when no explicit selection or non-QR scenario is supplied.
