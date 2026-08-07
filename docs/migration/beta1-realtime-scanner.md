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

The runtime is a Beta preview. `ScannerSessionStatistics` reports TTFD, TTFC, effective decode FPS, frame drops, Fast/Balanced/Robust distribution, Worker bounds, and controlled memory for development baselines. These measurements are not a physical-camera or production certification claim. The deterministic `DeterministicFrameSequenceSource` is intended for CI and benchmark tests; it does not replace real-device validation planned for the Beta 1 evidence freeze.
