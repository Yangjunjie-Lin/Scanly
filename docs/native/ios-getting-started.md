# ScanlySDK v2.0.1 for iOS

ScanlySDK v2.0.1 is a Stable Swift Package Manager source package for iOS 13+. CocoaPods is not a v2.0.1 distribution channel.

## Install from the immutable tag

The package manifest lives at `native/ios/Package.swift`, not the repository root. Swift Package Manager cannot resolve this repository as a remote versioned dependency using the root Git URL. For v2.0.1, check out the immutable tag and add the subdirectory as a local package:

```bash
git clone --branch v2.0.1 --depth 1 https://github.com/Yangjunjie-Lin/Scanly.git
```

In Xcode choose **File → Add Package Dependencies → Add Local** and select `Scanly/native/ios`, then add the `ScanlySDK` product to the app target. A Package.swift-based host can use a local path:

```swift
dependencies: [
    .package(path: "../Scanly/native/ios")
]
```

The checked-out `v2.0.1` tag is the version pin. Standard remote root-URL resolution such as `.package(url: ..., from: "2.0.1")` requires a root package manifest and is not supported by this repository layout.

## Decode

```swift
import ScanlySDK

let decoder = try ScanlyDecoder()
let results = try decoder.decode(pixelBuffer, options: ScanlyOptions(
    formats: [.qrCode, .dataMatrix],
    maxResults: 8
))
```

`decode(_:)` accepts NV12 and BGRA `CVPixelBuffer` values. NV12 reads the Y plane directly. For camera scanning, create `ScanlyScannerSession`, subscribe to `onResults`, bind `ScanlyCameraAdapter` to an `AVCaptureDevice`, and call `start`, `pause`, `resume`, or `stop` with the host lifecycle.

The host must provide `NSCameraUsageDescription`. It owns permission UI, preview rendering, orientation policy, interruption handling, and background/foreground transitions. The SDK suppresses stale generations but does not own application UI.

See [the iOS example](../../examples/ios/README.md) for continuous, multi-code, format-filtered, and torch composition.

Automated Swift build, simulator, and unsigned-device compilation are not physical-device qualification. Physical iPhone validation remains `POST_RELEASE_VALIDATION_PENDING` under [Issue #13](https://github.com/Yangjunjie-Lin/Scanly/issues/13).
