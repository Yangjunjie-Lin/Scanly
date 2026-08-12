# Public API and lifecycle

## Version policy

- SDK package version: `2.0.0-beta.3` (Beta 3 development preview)

`ScanResult.cornerPoints` are always expressed as pixel coordinates in the original normalized frame. ROI offsets, candidate crops, resizing, scale caps, and clockwise decode-attempt rotations are inverted before publication. Invalid or implausibly out-of-frame engine points are omitted.

`ScanResult.orientation`, when present, is an engine-derived clockwise angle relative to the original normalized frame. A preprocessing attempt rotation is debug metadata only and is never exposed as symbol orientation.

Static multi-code scans default to `payload-format-spatial` deduplication. Schema `2.1` also supports `payload`, `payload-format`, and `tracked-instance` policy selection. Geometry-proven separate instances with the same payload remain separate under the default; when geometry is unavailable, the documented fallback is payload plus format identity.

## Beta 3 industrial recovery surface

`@scanly/core` exports the public configuration and result contracts `RecoveryProfile`, `RecoveryBudget`, `RecoveryRouteId`, `BarcodeDifficultyDiagnosis`, `ScanEvidence`, and `ScannerDiagnostics`. `IndustrialRecoveryPipeline`, `RecoveryRouteRegistry`, and `RecoveryPlanner` are exported for advanced composition. Candidate-region heuristics, recovery coordinate implementations, preprocessing buffers, and temporary image ownership are not frozen as application APIs.

`RecoveryProfile` supports `fast`, `balanced`, `robust`, `industrial`, and `dpm-experimental`. The default camera experience does not select `industrial`, and DPM recovery is disabled unless the application selects `dpm-experimental` or explicitly enables it. A profile selects a bounded cost envelope; it is not an accuracy or certification level.

`ScanEvidence.evidenceScore` is not a calibrated probability. Decode candidates must pass decoder validation, and conflicting payload/format candidates are not silently chosen. Recovery results preserve original-frame `cornerPoints` through inverse crop, resize, homography, curvature, and padding transforms, so existing tracking and batch composition receive canonical geometry.

Browser static and camera composition accepts explicit recovery options. Node exports `scanWithNodeIndustrialRecovery` as the explicit static-image entry point. The existing `CaptureRouter.scan` and default camera path remain compatible and do not automatically run the highest-cost industrial profile.

See [Beta 3 industrial difficult-barcode recovery](../beta3-industrial-recovery.md) for budgets, route boundaries, Worker ownership, DPM limitations, evidence, and non-claims.

## Beta 2 tracking and batch surface

`@scanly/browser` exports tracking and batch composition from the package root. `ScannerSession.onObservations` publishes one complete `BarcodeObservationSet` per admitted frame, including every valid decoder result rather than only the primary result. `BatchScanSession` consumes that boundary and composes the existing scanner with `BarcodeTracker` and `BatchController`; it does not create another camera runtime.

| Runtime values | Runtime types |
| --- | --- |
| `BarcodeTracker`, `associateTracks`, `calculateAssociationCost` | `BarcodeTrack`, `BarcodeTrackState`, `BarcodeObservation`, `BarcodeTrackerOptions`, `BarcodeTrackerUpdate`, `TrackingStatistics` |
| `TrackROISet`, `ScannerTrackingRuntime`, `createTrackOverlayModel`, `createTrackOverlayModels` | `TrackROI`, `TrackROIPlan`, `TrackROISetOptions`, `ScannerTrackingRuntimeOptions`, `ScannerDecodeMode`, `ScannerDecodeROIPhase`, `TrackOverlayModel` |
| `BatchController`, `BatchScanSession` | `BatchScanSessionOptions`, `BatchMode`, `BatchStatus`, `BatchState`, `BatchEvent`, `ExpectedBatchItem`, `BatchStatistics` |

Track identity is physical and spatial: `trackId` is not the payload. Association is a bounded deterministic assignment over payload/format compatibility, center distance, IoU, geometry size, motion prediction, and elapsed time. The lifecycle is `tentative`, `confirmed`, `lost`, and `retired`; a compatible reappearance inside the grace window restores the same identity.

Batch completion uses confirmed physical tracks. `expected-count` cannot complete from repeat events, and checklist `quantity` supports multiple physical items carrying the same payload. `TrackOverlayModel` contains renderer-neutral geometry and labels; Canvas, SVG, DOM, and React remain consumers of that model.

`BatchControllerOptions.maxRetainedTracks` and `maxRetainedPhysicalInstances` bound long-running continuous and checklist evidence. Terminal completion freezes classification state; statistics expose current/peak retention and rejected/evicted counts for reliability gates.

See [Beta 2 barcode tracking and batch scan](../beta2-tracking-batch.md) for composition examples, bounded association behavior, ROI recovery, evidence, and non-claims.

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

The required Beta 1 real-time surface is exported from the `@scanly/browser` package root; none of the following contracts is internal:

| Runtime values | Runtime types |
| --- | --- |
| `ScannerSession` | `ScannerSessionOptions`, `ScannerSessionStatistics`, `ScannerSessionState` |
| `MediaStreamCameraFrameSource`, `DeterministicFrameSequenceSource` | `CameraFrameSource` |
| `FrameScheduler`, `FrameQualityAnalyzer` | `RepeatPolicy`, `ScanEvent`, `ScannerDiagnostic`, `ScannerHint` |
| `CameraCapabilityController` | `CameraCapabilities`, `CapabilityResult` |

The bounded escalation, temporal candidate, repeat-suppression, and temporal ROI classes are also package-root exports for advanced composition. Their ownership remains in the SDK runtime, not React UI code.

Camera capability tests validate unsupported torch/zoom, focus, manual zoom override, auto-zoom cooldown and maximum clamp, anti-oscillation state, and capability refresh after source switching. This is API/state-machine evidence only and is not a claim that physical auto zoom has been validated.

Beta 1 development evidence uses 20 scenario-specific Ground Truth drivers. The decoder stimulus is separate from each scenario's expected payload, format, event count, and physical-instance identity. `benchmark-results/realtime/sequence-results.json` uses schema `2.0-beta1` and records `expected`, `observed`, assertions, failure reasons, metrics, and event/profile/diagnostic timelines per scenario. A 10,000-frame fake-decoder Core Soak explicitly reports Worker evidence as not applicable. Real Worker/WASM evidence is separate: at least 1,000 pull-request frames, or 10,000 scheduled/manual frames, execute through `BrowserScannerFrameDecoder`, a persistent `DecodeWorkerClient`, a browser Worker, and ZXing-C++ WASM.

- Static decode scenario schema: `2.1`
- Real-time benchmark report schema: `2.0-beta1`
- Engine metadata comes from each registered plugin instance; core contains no decoder version map.

`npm run api:snapshot` and `npm run api:diff` validate the package-root declarations. Their presence here does not assert that a particular GitHub PR head has passed the Public API workflow.

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
