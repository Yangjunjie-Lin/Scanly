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

## Evidence boundary

`npm run benchmark:realtime` runs 20 deterministic sequences and a 10,000-frame soak. `tests/browser-benchmark/scanner-runtime.spec.ts` runs the deterministic session in Chromium, Firefox, and WebKit. These are simulator and development evidence. They do not substitute for Issue #13 project-owned photographs, physical-camera/device validation, or a future `v2-beta1-r1` evidence freeze.
