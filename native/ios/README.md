# ScanlySDK for iOS

See [iOS getting started](../../docs/native/ios-getting-started.md), [Native
architecture](../../docs/native/architecture.md), and [memory
ownership](../../docs/native/memory-model.md). v2.0.0 is the Stable Swift
Package Manager source artifact; physical validation remains
`POST_RELEASE_VALIDATION_PENDING` and is not represented as PASS.

Swift Package Manager foundation for iOS 13+. `ScanlyDecoder` owns a serialized
Native Core context and accepts NV12 Y-plane or BGRA `CVPixelBuffer` storage
directly. Borrowed frame memory is valid only for the synchronous C call; every
returned value is copied into Swift before the native result set is destroyed.

`ScanlyScannerSession` provides latest-frame backpressure, one active decode,
generation invalidation, stale-result discard, repeat suppression, and explicit
start/pause/resume/stop/dispose lifecycle. `ScanlyCameraAdapter` uses
`AVCaptureVideoDataOutput` and never creates `UIImage`, PNG, or JPEG intermediates.

Physical iPhone validation is `POST_RELEASE_VALIDATION_PENDING`; Swift
build/simulator/unit status must never be reported as physical-device evidence.
