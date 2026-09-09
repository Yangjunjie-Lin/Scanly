# Scanly SDK v2.0.1 for Android

Scanly SDK v2.0.1 is distributed as `scanly-sdk-2.0.1.aar` on the [v2.0.1 GitHub Release](https://github.com/Yangjunjie-Lin/Scanly/releases/tag/v2.0.1). Maven Central is **not published and not required for v2.0.1**; do not use `implementation("io.scanly:scanly-sdk:2.0.1")`.

## Install the AAR

1. Download `scanly-sdk-2.0.1.aar` from the GitHub Release.
2. Place it at `app/libs/scanly-sdk-2.0.1.aar`.
3. Add the file dependency:

```kotlin
dependencies {
    implementation(files("libs/scanly-sdk-2.0.1.aar"))
}
```

Verify the AAR against `release/stable/v2.0.1/checksums.sha256` or the checksum attached to the GitHub Release before integration.

## CameraX quick start

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

CameraX uses `ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST`. The `YUV_420_888` Y plane goes directly through JNI and every `ImageProxy` is closed. Call `pause`, `resume`, `stop`, or `close` with the host lifecycle.

The host must request camera permission. Torch support delegates to CameraX and can be unavailable for a specific camera. The AAR contains `arm64-v8a/libscanly_jni.so` and `x86_64/libscanly_jni.so`; `armeabi-v7a` is intentionally unsupported.

See [the Android example](../../examples/android/README.md).

Automated unit, lint, AAR, and x86_64 emulator fixture checks are not physical-device qualification. Physical Android validation remains `POST_RELEASE_VALIDATION_PENDING` under [Issue #13](https://github.com/Yangjunjie-Lin/Scanly/issues/13).
