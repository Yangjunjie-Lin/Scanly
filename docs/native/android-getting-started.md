# Android getting started

Beta 5 builds a Maven-compatible `io.scanly:scanly-sdk:2.0.0-beta.5` AAR as a CI
artifact; it is not published to Maven Central. A local project can include
`native/android` or consume the generated AAR.

```kotlin
val decoder = ScanlyDecoder()
val session = ScanlyScannerSession(
    decoder,
    ScanlyOptions(formats = setOf(ScanlyBarcodeFormat.QR_CODE), maxResults = 8),
)
session.onResults = { outcome -> outcome.onSuccess(::renderResults) }
val camera = ScanlyCameraXAdapter(context, session)
camera.bind(this) // LifecycleOwner
```

CameraX uses `ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST`. The Y plane of
`YUV_420_888` goes directly through JNI; the adapter always closes each
`ImageProxy`. Call `pause`, `resume`, `stop`, or `close` with the host lifecycle.

The host must request camera permission. `enableTorch` delegates to CameraX and
can be unavailable on a specific camera. The AAR must contain
`arm64-v8a/libscanly_jni.so` and `x86_64/libscanly_jni.so`; `armeabi-v7a` is
intentionally unsupported in Beta 5.

Emulator smoke evidence is automated. Physical Android validation remains
`DEFERRED_TO_RC`.
