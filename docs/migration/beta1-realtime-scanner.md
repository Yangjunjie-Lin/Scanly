# Beta 1 real-time scanner migration

Beta 1 development adds a continuous camera runtime while keeping the Alpha.5 static upload and Node APIs intact. Existing `BrowserCaptureSession` and `BrowserCameraSource` remain compatibility adapters. New camera integrations should compose:

```ts
const source = new MediaStreamCameraFrameSource({ video });
const session = new ScannerSession({
  source,
  repeatPolicy: { mode: "physical-instance", cooldownMs: 1_500 },
  confirmation: { mode: "adaptive" },
});
await session.start();
const unsubscribe = session.onResult((event) => {
  if (event.type === "emitted") console.log(event.barcode.text, event.barcode.format);
});
```

`ScannerSession` owns frame admission, Worker lifetime, temporal confirmation, ROI hints, cancellation generation, repeat suppression, diagnostics, and session statistics. UI code should subscribe to `onStateChange`, `onResult`, and `onDiagnostics`; it should not run a decode or retain a frame queue.

`CameraCapabilityController` can be used for typed torch, zoom, focus, and auto-zoom state management. Unsupported torch/zoom, manual override, cooldown, maximum clamping, anti-oscillation, and source-switch refresh are deterministic state-logic contracts. Applications must still feature-detect the active track and must not interpret these tests as physical auto-zoom validation.

The runtime is a Beta preview. `ScannerSessionStatistics` reports TTFD, TTFC, effective decode FPS, frame drops, Fast/Balanced/Robust distribution, repeat/stale counts, queue peaks, Worker activity, and controlled memory for development evidence.

The 20-sequence harness uses scenario-specific drivers and independent Ground Truth; report schema `2.0-beta1` keeps expected events separate from decoder stimulus and records observed events, assertions, failure reasons, metrics, and timelines. Its 10,000-frame Scanner Core Soak uses a fake decoder to exercise successful temporal confirmation, repeat suppression, and ROI follow-ups while explicitly marking Worker evidence not applicable. Persistent browser Worker and ZXing-C++ WASM evidence comes only from the separate 1,000-frame pull-request soak or 10,000-frame extended soak. Apply the `scanner-extended-soak` pull-request label to exercise the latter against an exact PR head; GitHub registers its scheduled/manual entry after the workflow definition reaches the repository default branch.

Browser automation covers real-time smoke, lifecycle, once-per-session repeat, and latest-frame backpressure in Chromium, Firefox, and WebKit. These deterministic sources do not replace [Issue #13](https://github.com/Yangjunjie-Lin/Scanly/issues/13), project-owned photographs, or real-device validation. Runtime integration may be `GO` after its gates pass; release remains `NO-GO` while the project-owned corpus is 0/12. No `v2-beta1-r1` evidence activation is authorized, and no exact-SHA GitHub pass is implied by this migration guide.
