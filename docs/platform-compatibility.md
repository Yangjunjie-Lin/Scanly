# Platform compatibility matrix

Allowed statuses are `verified`, `partially-verified`, `unsupported`, `unavailable`, and `not-tested`. `verified` below means automated browser/runtime evidence only unless the row explicitly identifies a physical session.

| Platform | Browser | Camera | Worker | WASM | Torch | Zoom | Focus | Tracking | Industrial | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CI Linux | Chromium | simulated contract | verified | verified | not-tested | not-tested | not-tested | verified | verified | partially-verified |
| CI Linux | Firefox | simulated contract | verified | verified | not-tested | not-tested | not-tested | verified | verified | partially-verified |
| CI Linux | WebKit | simulated contract | verified | verified | not-tested | not-tested | not-tested | verified | verified | partially-verified |
| Physical iPhone generation 1 | Safari | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested |
| Physical iPhone generation 2 | Safari | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested |
| Physical Android lower-end | Chrome | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested |
| Physical Android mid-range | Chrome | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested |
| Physical Android flagship | Chrome | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested | not-tested |
| Desktop real webcam | browser not selected | not-tested | not-tested | not-tested | unavailable | not-tested | not-tested | not-tested | not-tested | not-tested |

Automated WebKit is not iOS Safari physical evidence. CI Chromium/Firefox/WebKit prove browser regression behavior, Worker/WASM paths, and deterministic camera lifecycle contracts; they do not prove real camera permissions, lenses, background suspension, thermal behavior, or long-running hardware stability.

Current matrix state: `DEVICE_MATRIX_PARTIAL` / `FULL_DEVICE_MATRIX_PENDING` /
`PHYSICAL_DEVICE_VALIDATION_DEFERRED_TO_RC`. Automated integration is GO, but
physical iOS Safari, Android Chrome, real-camera lifecycle, tracking/batch, and
long-running camera evidence are intentionally deferred to the final RC
validation campaign. No deferred row is a PASS.
