# SDK v2 Beta 5 native mobile foundation

Beta 5 extends Scanly's pinned ZXing-C++ decode behavior to platform-native
camera frames without creating independent iOS and Android decoders.

## Acceptance state

The integration gate requires exact-head success from Native Core, iOS SDK,
Android SDK, Native Fixture Parity, Native Memory, Native Artifact Validation,
and all existing CI, benchmark, browser, Public API, and Device Evidence checks.
Until those remote jobs are green, Beta 5 is software-incomplete and no GO is
claimed. After they are green, the allowed status is
`BETA5_NATIVE_INTEGRATION_GO` with `NATIVE_PHYSICAL_IOS_PENDING` and
`NATIVE_PHYSICAL_ANDROID_PENDING`.

P0 includes shared native decode parity, direct camera frame input, explicit
ownership, typed errors, multi-result support, build/package verification, and
malformed-input safety. P1 includes latest-frame native sessions, generation
invalidation, temporal repeat suppression, and lifecycle state. Full
tracking/batch algorithm parity remains P2; shared deterministic wrapper
contracts keep future convergence auditable.

The development benchmark records cold initialization and warm small/large,
single/multi P50/P95 values but defines no commercial threshold. The memory
gate exercises 10,000 context/result lifecycles under sanitizers.

## Evidence boundary

The committed Beta 4 evidence counts remain truthful:

```text
physicalMobileDeviceCount = 0
iosSafariSessionCount = 0
androidChromeSessionCount = 0
physicalLongSessionCount = 0
```

The final RC campaign must execute real Web Safari, Web Chrome, Native iOS,
Native Android, camera lifecycle, tracking/batch, 30/60-minute soak, thermal,
battery, network-isolation, and unified device matrix validation from RC
exact-source. Issue #13 remains open as the unified physical evidence gate.

No tag, GitHub Release, npm latest, Maven Central, CocoaPods, App Store, Google
Play, Stable, or production certification is produced in Beta 5.
