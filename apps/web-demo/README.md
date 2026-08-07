# Scanly web demo

Reference Next.js application consuming `@scanly/browser` and the v2 public result/error model. Decoding, Worker ownership, camera cleanup, and semantic parsing are SDK responsibilities rather than React-owned implementation.

Beta 1 Camera Mode composes `MediaStreamCameraFrameSource` with `ScannerSession`. React subscribes to scanner state, emitted results, and heuristic hints and renders pause/resume, torch, zoom, and camera selection controls; frame scheduling, temporal confirmation, ROI, repeat suppression, Worker state, and cancellation remain inside the SDK.
