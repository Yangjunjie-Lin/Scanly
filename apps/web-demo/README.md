# Scanly web demo

Reference Next.js application consuming `@scanly/browser` and the v2 public result/error model. Decoding, Worker ownership, camera cleanup, and semantic parsing are SDK responsibilities rather than React-owned implementation.

Camera Mode composes `MediaStreamCameraFrameSource` with `ScannerSession`. React subscribes to scanner state, emitted results, and heuristic hints and renders pause/resume, torch, zoom, and camera selection controls; frame scheduling, temporal confirmation, ROI, repeat suppression, Worker state, and cancellation remain inside the SDK.

**Tracking / Batch** camera mode composes that same `ScannerSession` with `BatchScanSession`, subscribes to SDK `TrackEvent`/`BatchEvent` state, and renders `TrackOverlayModel` rectangles, track IDs, payloads, formats, lifecycle states, and confirmed-physical-instance progress. The expected-count control is capped at the SDK limit of 32 targets. React does not calculate association costs, assign identities, recover occlusions, count repeats, or decide batch completion.

The demo intentionally presents an SDK foundation rather than a warehouse workflow or AR experience. Camera/device behavior still depends on HTTPS, browser permissions, and hardware, and the deterministic cross-browser suite is not physical-device certification.

The separate `/device-lab` route supports post-release physical qualification. It shows browser and MediaTrack reports, exercises bounded camera lifecycle/capability APIs, records performance windows, observes external resource requests, and exports review-required drafts. The regular demo remains free of test protocol state. `/device-lab/targets` renders fixed screen targets generated from decoder-independent Ground Truth.
