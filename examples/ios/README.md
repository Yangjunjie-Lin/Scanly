# Scanly iOS camera example

This source sketch shows host composition; open `native/ios` as a Swift package
and add these values to an iOS app target. It performs no analytics or uploads.

```swift
import AVFoundation
import ScanlySDK

let decoder = try ScanlyDecoder()
let scanner = ScanlyScannerSession(
    decoder: decoder,
    options: ScanlyOptions(formats: [.qrCode, .dataMatrix, .code128], maxResults: 8)
)
scanner.onResults = { outcome in
    DispatchQueue.main.async { print(outcome) } // single, continuous, and multi-code values
}
let camera = ScanlyCameraAdapter(session: scanner)
if let device = AVCaptureDevice.default(for: .video) {
    try camera.bind(device: device)
    camera.start()
    if device.hasTorch {
        try? device.lockForConfiguration()
        device.torchMode = .auto
        device.unlockForConfiguration()
    }
}
// camera.pause(); camera.resume(); camera.stop()
```

The host app supplies camera permission UI, preview rendering, orientation
policy, and interruption notifications. Physical iPhone behavior is not
certified by this sample.
