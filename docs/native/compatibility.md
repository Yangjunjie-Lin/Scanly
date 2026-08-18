# Native compatibility

Beta 5 is an integration foundation, not a published or certified release.

| Target | Minimum / ABI | Automated gate | Physical status |
| --- | --- | --- | --- |
| iOS | iOS 13; Swift Package Manager | Swift build/test, generic simulator and unsigned device compilation | `DEFERRED_TO_RC` |
| Android | API 24; Java 17 | AAR, unit/lint, x86_64 emulator fixture smoke | `DEFERRED_TO_RC` |
| Android ABI | `arm64-v8a`, `x86_64` | both `.so` entries required in AAR | `DEFERRED_TO_RC` |
| `armeabi-v7a` | unsupported in Beta 5 | omission is intentional | not tested |

Supported public formats are QR Code, Data Matrix, PDF417, Code 128, EAN-13,
EAN-8, UPC-A, and UPC-E. Nine shared fixtures exercise all eight formats plus
one two-symbol QR Code + Code 128 image. Existing Web/Node tests exercise the
same public vocabulary; the common native mask supports all eight.

Only Swift Package Manager and a Maven-compatible AAR are produced as CI
artifacts. CocoaPods, Maven Central, App Store, Google Play, GitHub Stable,
`npm latest`, React Native, and Flutter publication are outside Beta 5.

Statuses such as simulator PASS or emulator PASS never imply a physical iPhone
or Android PASS. Any toolchain lane that cannot execute must report `NOT_RUN`,
not PASS.
