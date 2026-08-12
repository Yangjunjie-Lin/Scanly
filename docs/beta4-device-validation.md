# Beta 4 physical device validation protocol

## Current gate

`DEVICE_HARNESS_GO` / `PHYSICAL_DEVICE_VALIDATION_PENDING`.

The repository contains the Device Lab, deterministic targets, independent Ground Truth, fail-closed schema/verifier, camera lifecycle contracts, and a dedicated CI workflow. It contains zero reviewed physical-device sessions. Therefore Scanly does not claim that physical mobile validation has started and does not claim a completed 30-minute physical soak.

## Evidence boundary

Every run declares exactly one evidence type:

- `simulated`: deterministic or browser automation without physical camera hardware.
- `desktop-camera`: an actual desktop/laptop camera; never mobile evidence.
- `physical-mobile`: a locally accessed physical phone/tablet.
- `remote-physical-device`: real hardware accessed through a device farm.

An emulator, simulator, user-agent override, Playwright fake camera, Internet photograph, or desktop webcam cannot become physical-mobile evidence. `device-evidence/status.json` must remain pending until reviewed session files exist. CI can validate evidence but cannot create physical status.

## Test preparation

1. Check out and build a clean source commit. Record `sourceCommit`, its `sourceTree`, and SDK version before the session.
2. Generate or verify targets with `npm run device:targets:verify`.
3. Review `device-lab/manifest.json` and fixed `device-lab/test-targets/ground-truth.json` before scanning. Expected values must not come from a Scanly result.
4. Open `/device-lab` over HTTPS. Fill tester-declared model, manufacturer, OS, and browser fields. Browser/camera fields remain browser/API reported.
5. Do not capture or commit faces, addresses, serial numbers, private screens, or camera roll images. Metadata-only evidence is preferred.

## Scenario execution

Execute P1–P12 and N1 as defined by the manifest. Distances are tester measured; approximate angles are tester declared. Low-light notes describe the environment and cannot use a lux value without a real measurement. P9 uses at least four physical targets. P10 requires two separately labelled physical instances with the same payload and distinct `physicalInstanceId`. Tracking reports identity switches, fragmentation, and false tracks. Batch records an expected count set before scanning.

False confirmed scans must be zero for every passed physical scenario. A failed or missing scenario is reported as `failed`, `not-tested`, or `unavailable`, never blank.

## Camera lifecycle and capabilities

- Permission: prompt, denial, grant, and revocation where supported. Errors must be typed; no unhandled rejection or indefinite loading is acceptable.
- Switching: rear → front → rear. Verify old tracks stop, new track is live, the old generation is invalidated, and stale public results remain zero.
- Orientation: portrait → landscape → portrait. Verify dimensions, mapping, overlay, and tracker geometry.
- Background/interruption: background and foreground the app; test screen lock or another interruption where the platform permits. The scanner must recover or fail explicitly.
- Torch: when API-reported as supported, test on and off. Otherwise record `unsupported`.
- Zoom: test minimum, middle, maximum safe value, auto cooldown, and manual override. Unsupported is not a failure.
- Focus: test only when the browser exposes a controllable focus mode; otherwise record `unavailable`.

## Long session

The physical soak target is 30 minutes; 60 minutes is an optional extended manual tier. Record duration, captured/admitted/dropped frames, attempts, results, false confirmations, Worker count, restarts, track endings, errors, stale public events, and final controlled resources. First, middle, and last five-minute windows retain P50/P95 decode, effective FPS, frame-drop rate, and TTFC. Cross-device performance is never averaged into a flagship claim.

Process memory or chip temperature must not be invented. Scanly-controlled resources are always recorded. Browser memory is included only when browser reported. Thermal observation is `tester-observed`, `OS-reported`, `external-measured`, or `unavailable`. Battery percentage is tester recorded with duration and screen brightness policy; it is not laboratory wattage.

## Privacy and offline boundary

Barcode pixels and payload remain local. The Device Lab reports resource requests during the session and contains no analytics, tracking, upload, or cloud decode call. For network isolation, load the application, disable network access, and confirm that the already-loaded scanner continues. This proves no remote decode dependency; it does not claim full PWA/offline installation support.

## Admission

Review the draft, compare every result to fixed Ground Truth, fill field sources, set both sensitive-data and rights review to true, and ensure the tested repository was clean. Store only reviewed JSON metadata in `device-evidence/sessions/`, update counts/status, then run:

```text
npm run device:targets:verify
npm run device:evidence:verify
npm run benchmark:device
```

A 30-minute claim additionally requires false confirmations = 0, stale public events = 0, and final controlled resources = 0. Physical mobile validation may be described as started only after at least one reviewed iOS Safari and one reviewed Android Chrome physical session exist.
