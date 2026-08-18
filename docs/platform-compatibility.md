# Platform compatibility matrix

Scanly v2.0.0 is already published. The physical matrix below is a post-release qualification program, not a publication gate.

Allowed runtime statuses are `verified`, `partially-verified`, `unsupported`, `unavailable`, and `not-tested`. `verified` means automated evidence unless a row explicitly identifies an admitted physical session.

| Platform | Browser/runtime | Camera | Worker | WASM/Native | Tracking | Industrial recovery | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CI Linux | Chromium | simulated contract | verified | WASM verified | verified | verified | partially-verified |
| CI Linux | Firefox | simulated contract | verified | WASM verified | verified | verified | partially-verified |
| CI Linux | WebKit | simulated contract | verified | WASM verified | verified | verified | partially-verified |
| Node 20–24 | Node.js | not applicable | not applicable | WASM verified | API verified | verified | verified |
| iOS simulator/build | ScanlySDK | simulated/build only | not applicable | Swift/Native build verified | session contracts verified | decode contracts verified | partially-verified |
| Android x86_64 emulator | io.scanly.sdk | emulator only | not applicable | AAR/JNI verified | session contracts verified | decode contracts verified | partially-verified |
| Physical iPhone generation 1 | Safari / ScanlySDK | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested |
| Physical iPhone generation 2 | Safari / ScanlySDK | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested |
| Physical Android lower-end | Chrome / io.scanly.sdk | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested |
| Physical Android mid-range | Chrome / io.scanly.sdk | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested |
| Physical Android flagship | Chrome / io.scanly.sdk | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested |
| Desktop real webcam | browser not selected | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested |

Automated WebKit is not physical iOS Safari evidence. CI and simulator/emulator checks exercise browser regression behavior, Worker/WASM paths, Native contracts, and deterministic lifecycle behavior; they do not prove camera permissions, lenses, torch/zoom/focus, background suspension, thermals, or long-running hardware stability.

Current state:

- `POST_RELEASE_VALIDATION_REQUIRED`
- Full physical matrix: `POST_RELEASE_VALIDATION_PENDING`
- Web iOS and Android: `POST_RELEASE_VALIDATION_PENDING`
- Native iOS and Android: `POST_RELEASE_VALIDATION_PENDING`
- 30-minute and 60-minute physical camera soaks: `POST_RELEASE_VALIDATION_PENDING`
- Admitted physical counts: `0`

Every untested row remains `NOT_TESTED`; no automated result upgrades it to physical PASS. Completion is tracked in [Issue #13](https://github.com/Yangjunjie-Lin/Scanly/issues/13).
