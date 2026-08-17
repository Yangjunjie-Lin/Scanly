# Scanly Android SDK

See [Android getting started](../../docs/native/android-getting-started.md),
[Native architecture](../../docs/native/architecture.md), and [memory
ownership](../../docs/native/memory-model.md). v2.0.0 is a Stable software
artifact; physical validation remains `POST_RELEASE_VALIDATION_PENDING` and is
not represented as PASS.

`io.scanly.sdk` is an Android library/AAR foundation with a hidden-symbol JNI
bridge to the shared Native Core. The required AAR ABIs are `arm64-v8a` and
`x86_64`; `armeabi-v7a` remains explicitly unsupported in v2.0.0.

`ScanlyCameraXAdapter` configures `STRATEGY_KEEP_ONLY_LATEST`, reads the
`YUV_420_888` Y plane as a direct `ByteBuffer`, decodes synchronously while
`ImageProxy` owns the buffer, and then closes the proxy. It never converts a
frame through Bitmap/JPEG.

Physical Android validation is `POST_RELEASE_VALIDATION_PENDING`. JVM and
emulator tests are automated integration evidence only.
