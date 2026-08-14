# Scanly Android SDK

See [Android getting started](../../docs/native/android-getting-started.md),
[Native architecture](../../docs/native/architecture.md), and [memory
ownership](../../docs/native/memory-model.md). RC1 is an AAR CI candidate only
(`2.0.0-rc.1`); physical validation is deferred.

`io.scanly.sdk` is an Android library/AAR foundation with a hidden-symbol JNI
bridge to the shared Native Core. The required AAR ABIs are `arm64-v8a` and
`x86_64`; `armeabi-v7a` is intentionally unsupported in RC1.

`ScanlyCameraXAdapter` configures `STRATEGY_KEEP_ONLY_LATEST`, reads the
`YUV_420_888` Y plane as a direct `ByteBuffer`, decodes synchronously while
`ImageProxy` owns the buffer, and then closes the proxy. It never converts a
frame through Bitmap/JPEG.

Physical Android validation is `DEFERRED_TO_RC`. JVM and emulator tests are
automated integration evidence only.
