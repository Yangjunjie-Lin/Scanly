# iOS getting started

Add this repository's `native/ios` package in Xcode and select the `ScanlySDK`
product. Beta 5 is a source package pinned to the shared ZXing-C++ revision; no
CocoaPods release is published.

```swift
import ScanlySDK

let decoder = try ScanlyDecoder()
let results = try decoder.decode(pixelBuffer, options: ScanlyOptions(
    formats: [.qrCode, .dataMatrix],
    maxResults: 8
))
```

`decode(_:)` accepts NV12 and BGRA `CVPixelBuffer` values. NV12 reads the Y
plane directly. For camera scanning, create `ScanlyScannerSession`, subscribe to
`onResults`, bind `ScanlyCameraAdapter` to an `AVCaptureDevice`, and call
`start`, `pause`, `resume`, or `stop` with the host lifecycle.

The app must provide `NSCameraUsageDescription`. Observe background/foreground,
interruption, and orientation events in the host and transition/rebind the
adapter as appropriate. The SDK suppresses stale generations but does not own
the application UI or permission prompt.

See `examples/ios` for continuous scan, multi-code, format filtering, and torch
composition. Simulator/unit evidence is automated; physical iPhone validation
remains `DEFERRED_TO_RC`.
