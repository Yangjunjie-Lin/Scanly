# Scanly Android CameraX example

This source sketch consumes the v2.0.0 Stable AAR/module. It performs no analytics or
uploads.

```kotlin
val decoder = ScanlyDecoder()
val scanner = ScanlyScannerSession(
    decoder,
    ScanlyOptions(
        formats = setOf(
            ScanlyBarcodeFormat.QR_CODE,
            ScanlyBarcodeFormat.DATA_MATRIX,
            ScanlyBarcodeFormat.CODE_128,
        ),
        maxResults = 8,
    ),
)
scanner.onResults = { outcome ->
    outcome.onSuccess { results -> runOnUiThread { render(results) } }
}
val adapter = ScanlyCameraXAdapter(this, scanner)
adapter.bind(this) // Activity implements LifecycleOwner
adapter.enableTorch(true)
// adapter.pause(); adapter.resume(); adapter.stop(); adapter.close()
```

The one session covers single, continuous, format-restricted, and multi-code
results. The host owns runtime camera permission and rendering. Physical Android
behavior remains `POST_RELEASE_VALIDATION_PENDING`; this sample is not qualification evidence.
