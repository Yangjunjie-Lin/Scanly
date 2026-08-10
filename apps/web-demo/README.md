# Scanly web demo

Reference Next.js application consuming `@scanly/browser` and the v2 public result/error model. Decoding, Worker ownership, camera cleanup, and semantic parsing are SDK responsibilities rather than React-owned implementation.

Beta 1 Camera Mode composes `MediaStreamCameraFrameSource` with `ScannerSession`. React subscribes to scanner state, emitted results, and heuristic hints and renders pause/resume, torch, zoom, and camera selection controls; frame scheduling, temporal confirmation, ROI, repeat suppression, Worker state, and cancellation remain inside the SDK.

Beta 2 adds a **Tracking / Batch** camera mode. It composes that same `ScannerSession` with `BatchScanSession`, subscribes to SDK `TrackEvent`/`BatchEvent` state, and renders `TrackOverlayModel` rectangles, track IDs, payloads, formats, lifecycle states, and confirmed-physical-instance progress. The expected-count control is capped at the SDK development limit of 32 targets. React does not calculate association costs, assign identities, recover occlusions, count repeats, or decide batch completion.

The demo intentionally presents an SDK foundation rather than a warehouse workflow or AR experience. Camera/device behavior still depends on HTTPS, browser permissions, and hardware, and the deterministic cross-browser suite is not physical-device certification.
