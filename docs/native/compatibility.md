# Native compatibility

Scanly Native SDK v2.0.1 is a Stable software release. Automated build and fixture coverage is verified; post-release physical qualification remains pending.

| Target | Minimum / ABI | Distribution | Automated verification | Physical status |
| --- | --- | --- | --- | --- |
| iOS | iOS 13; Swift tools 5.9; current supported Xcode capable of Swift 5.9 packages | SPM source package at `native/ios` in tag `v2.0.1` | Swift build/test, simulator, unsigned device compilation | `POST_RELEASE_VALIDATION_PENDING` |
| Android | API 24; Java 17 | GitHub Release AAR | AAR, unit/lint, x86_64 emulator fixture smoke | `POST_RELEASE_VALIDATION_PENDING` |
| Android ABI | `arm64-v8a`, `x86_64` | AAR native libraries | both `.so` entries required | `POST_RELEASE_VALIDATION_PENDING` |
| `armeabi-v7a` | unsupported | not shipped | omission verified | `unsupported` |

Supported public formats are QR Code, Data Matrix, PDF417, Code 128, EAN-13, EAN-8, UPC-A, and UPC-E. Shared native fixtures cover all eight formats plus one two-symbol QR Code + Code 128 image.

Distribution boundaries for v2.0.1:

- Swift Package Manager source package: shipped under the immutable Git tag; use exact-tag checkout plus the local `native/ios` package path because the repository root has no Package.swift.
- Android AAR: shipped through the GitHub Release.
- CocoaPods and Maven Central: not published.
- App Store, Google Play, React Native, and Flutter: not SDK distribution channels for v2.0.1.

Simulator or emulator PASS never implies physical iPhone or Android PASS. Any unavailable toolchain lane reports `NOT_RUN` or `NOT_TESTED`, not PASS. Physical validation continues under [Issue #13](https://github.com/Yangjunjie-Lin/Scanly/issues/13).
