# Beta 1 real-time scanner runtime

Beta 1 extends the Alpha.5 single-frame Router without replacing it. Static upload and Node callers still submit one `NormalizedFrame`; continuous camera callers use `ScannerSession`.

```text
CameraFrameSource
  -> FrameScheduler (one active decode, latest pending frame)
  -> FrameQualityAnalyzer (cheap admission plus periodic probes)
  -> BoundedDecodeEscalation (Fast, Balanced probes, bounded Robust)
  -> TemporalROI (previous ROI, expanded ROI, full-frame recovery)
  -> CaptureRouter / persistent DecodeWorkerClient
  -> TemporalCandidateStore (immediate, confirm-two, adaptive)
  -> RepeatSuppressor (allow, cooldown, once/session, physical instance)
  -> ScanEvent and ScannerSessionStatistics
```

## Ownership and lifecycle

`ScannerSession` owns source start/stop, Worker cancellation, scheduler state, frame release, temporal stores, ROI, repeat history, diagnostic listeners, and the session generation. The state machine is `idle -> starting -> scanning <-> paused -> stopping -> stopped`; unrecoverable source failures enter `failed`. Engine failures are frame-local and remain eligible for Worker-to-main-thread or engine fallback.

At most one expensive decode is active. When a media source produces frames while decoding, the scheduler releases the older pending frame and retains the newest frame. Stop aborts the active generation, drains the scheduler, releases the pending frame, stops every camera track, and reports zero active decode, pending frame, WASM input allocation, native result count, and controlled final memory.

## Quality, escalation, and ROI

The quality analyzer samples luminance and gradients; blur, exposure, glare, contrast, edge density, and motion are heuristic diagnostics. A rejected frame does not run an expensive pipeline, but every configurable Nth frame is a probe. Decode starts Fast. Consecutive misses permit deterministic Balanced probes; Robust is separated by a frame cooldown and requires usable quality plus either a stable ROI or a longer full-frame miss run.

After a geometric result, `TemporalROI` reuses an expanded relative region. Miss count, time, orientation, or material frame-geometry changes invalidate it automatically and recover full-frame search.

## Temporal correctness

Adaptive confirmation can accept a high-quality trusted-engine observation immediately; edge cases require two stable observations in a bounded three-observation window. Repeat suppression evaluates confirmed observations. Physical-instance mode combines payload, format, geometry, spatial separation, disappearance, and re-entry, allowing separate products with the same UPC to emit independently.

Only `emitted` events go to the normal result listener. Detected, confirmed, suppressed, lost, quality, scheduling, and error detail is available through diagnostics. A generation mismatch increments discarded-result telemetry but never produces a stale public event.

## Semantic Ground Truth harness

The real-time harness contains 20 scenario-specific drivers. A scenario ID is not evidence by itself: each driver creates its source, configures its actual `ScannerSession`, executes lifecycle or timing actions, records decode requests and diagnostics, and evaluates observation-derived assertions against separate Ground Truth. Decoder stimulus and expected payload/format/instance output are separate fields, so the decoder does not define correctness.

| ID | Real behavior exercised |
| --- | --- |
| A | Fast-first escalation after consecutive misses, then explicit Balanced and bounded Robust probes |
| B | 50 equal observations with `once-per-session`, one emission, and suppressed repeats |
| C | Equal payloads under `physical-instance` with separated geometry and distinct instance IDs |
| D | Pixel-level blur rejection, periodic probing, and clear-frame recovery |
| E | Geometry-created ROI, ROI-bearing decode requests, motion expansion, invalidation, full-frame recovery, and re-tracking |
| F | Confirmed, lost, re-detected, and policy-based re-emission ordering |
| G | Pixel-level underexposure, rejected frames, periodic probes, and recovery |
| H | A saturated glare area, `glareDominated`, and clear-frame recovery |
| I | Adaptive confirmation of one trusted, usable observation with TTFC bounded by that observation |
| J | A decoder-observed `fast`, `fast`, `balanced` profile prefix |
| K | At least one Robust attempt while Robust remains far below admitted-frame count |
| L | Actual `start()`, `pause()`, and `resume()` calls with no paused admission or emission |
| M | `start()`, `stop()`, and restart with a new generation, discarded old work, and a usable new scan |
| N | An unresolved decode completed after generation invalidation, counted as stale internally with no stale public event |
| O | A slow decoder, one active decode, one latest-pending slot, real drops, and final processing of the newest frame |
| P | Stable geometry confirming on the second observation |
| Q | Jittered geometry preventing early confirmation and requiring an additional stable observation |
| R | A structurally malformed frame isolated as a failure, followed by a valid emitted frame |
| S | `BrowserScannerFrameDecoder` and `DecodeWorkerClient` Worker failure followed by the documented main-thread fallback |
| T | Disposal during pending owned-Worker work, Worker termination, drained queues/memory, and no late event |

`benchmark-results/realtime/sequence-results.json` uses `schemaVersion: "2.0-beta1"`. It records source commit/tree/dirty state and SDK version, then, for every scenario, `expected`, `observed`, `assertions`, `pass`, `failureReasons`, metrics, and event/profile/diagnostic timelines. Metrics include captured/admitted/dropped/quality-rejected/probe frames; Fast/Balanced/Robust attempts; decode, confirmation, emission, repeat, stale, and lost counts; TTFD, TTFC, average/p95 decode time, effective decode FPS, drop rate, and peak pending frames.

`falseConfirmedScans` is derived from emitted payload/format entries that cannot be matched to the scenario's independent expected event timeline. Physical-instance, duplicate, stale-event, frame-drop, and queue gates are likewise derived from named scenario reports. A literal or decoder-supplied correctness value cannot make an aggregate gate pass.

## Two soak layers

The two soak tiers prove different things and are never interchangeable:

| Soak | Execution | Evidence contract |
| --- | --- | --- |
| Scanner Core Soak | 10,000 frames through the scheduler/session with a deterministic fake decoder | Frame ownership, lifecycle, temporal stores, drained active/pending work, and final controlled memory. It records `workerEvidence: "not-applicable"` and a Worker count of zero; zero is not a persistent-Worker pass. |
| Scanner Worker/WASM Soak (pull request) | At least 1,000 actual decode frames through `BrowserScannerFrameDecoder`, one persistent `DecodeWorkerClient`, a real browser Worker, and ZXing-C++ WASM | Exactly one Worker created, peak active tasks at most one, real Worker/WASM execution count, zero final active tasks/pending frames/live WASM input bytes/native results/stale events, and exactly one owned Worker termination after disposal. |
| Scanner Worker/WASM Soak (extended) | 10,000 actual Worker/WASM decode frames on scheduled or manual runs | The same Worker, native-boundary, disposal, and live-allocation gates at extended duration. |

The dedicated Worker/WASM report is produced by `npm run test:scanner:worker-wasm-soak -- --iterations=1000`; `npm run test:scanner:worker-wasm-soak:extended` supplies the 10,000-frame scheduled/manual tier. By default, `npm run benchmark:realtime` evaluates the 20 semantic scenarios and Core soak and also requires a passing same-source Worker/WASM report. The integration-only CI producer uses an explicit `--allow-missing-worker-wasm` scope before the dedicated Worker artifact exists; the final Real-Time Benchmark requires a clean repository and exact-source Worker evidence with `--require-worker-wasm`.

## Browser and camera capability evidence

The browser real-time suite retains the smoke test and adds lifecycle, once-per-session repeat, and slow-decoder latest-frame backpressure tests. The Browser Benchmark matrix executes all four files in Chromium, Firefox, and WebKit; Firefox is a required matrix member, not an optional result. These deterministic browser tests do not claim a physical camera was exercised.

`CameraCapabilityController` state tests cover supported and unsupported torch/zoom, focus, manual zoom override, auto-zoom cooldown, maximum-zoom clamping, no repeated/oscillating requests when settings lag, and capability/policy refresh after a source switch. This validates capability state and constraint logic only. It must not be described as physical auto-zoom validation.

## Integration and release boundary

The Beta 1 runtime may be an integration `GO` when its runtime gates pass. Beta 1 release evidence remains `NO-GO` while [Issue #13](https://github.com/Yangjunjie-Lin/Scanly/issues/13) is open and the project-owned real-photo corpus remains **0 of 12**; repository-generated or Internet-sourced images cannot replace that gate. Physical-camera/device evidence also remains outstanding.

No `v2-beta1-r1` evidence activation is authorized in this phase. Repository documentation describes the required checks but does not claim that a GitHub PR exact-SHA run passed; that status must come from the actual CI, Full Benchmark, Browser Benchmark, Public API, and deployment checks for the PR head.
