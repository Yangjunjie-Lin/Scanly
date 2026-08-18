# Beta 4 physical device validation protocol

## Current gate

`BETA4_INTEGRATION_GO` / `DEVICE_HARNESS_GO` /
`AUTOMATED_VALIDATION_GO` / `PHYSICAL_DEVICE_VALIDATION_DEFERRED_TO_RC` /
`FULL_DEVICE_MATRIX_PENDING` / `BETA4_RELEASE_NO_GO`.

The repository contains the Device Lab, deterministic targets, independent
Ground Truth, fail-closed schema/verifier, camera lifecycle contracts, and a
dedicated CI workflow. It currently contains zero reviewed physical-device
sessions. Scanly therefore does not claim that physical validation has started
or that a 30-minute physical-camera soak has completed. Physical iOS Safari,
Android Chrome, real-camera lifecycle, physical tracking/batch, and long-running
camera evidence have intentionally been deferred to the final RC validation
campaign. This is `DEFERRED_TO_RC`, never `PASS`; never synthesize a replacement
session or change any zero count to permit integration.

## Integration and release gates

The `integration` gate permits physical evidence to remain deferred only when
the Device Harness, CI, Browser, Tracking, Industrial, Public API, and evidence
contract checks all pass on the exact source. The local
`npm run beta4:gate:integration` command proves only the fail-closed Device
Evidence component; the independent GitHub checks collectively establish the
project-level `AUTOMATED_VALIDATION_GO` state.

The `release` gate is intentionally stricter. `npm run beta4:gate:release`
requires admitted exact-source real iOS Safari, real Android Chrome, a
qualifying physical camera soak, and the full Issue #13 device matrix. RC must
also activate explicit evidence-to-matrix-row contracts before release can be
GO. Any missing physical requirement produces `BETA4_RELEASE_NO_GO`.

## Evidence boundary

Every run declares exactly one evidence type:

- `simulated`: deterministic or browser automation without physical camera
  hardware.
- `desktop-camera`: an actual desktop/laptop camera; never mobile evidence.
- `physical-mobile`: a locally accessed physical phone or tablet.
- `remote-physical-device`: confirmed real hardware accessed through a device
  farm, with provider session/device identity and a provider attestation URL
  plus SHA-256 retained for review.

An emulator, simulator, user-agent override, Playwright fake camera, Internet
photograph, synthetic frame, or desktop webcam cannot become physical-mobile
evidence. CI validates admitted evidence but cannot create physical status.

## Test preparation

1. Check out and build a clean source commit. Record `sourceCommit`, its
   `sourceTree`, and SDK version before the session. For a deployed Device Lab,
   also record deployment URL/ID and verify its exact Git commit.
2. Verify target bytes with `npm run device:targets:verify`.
3. Review `device-lab/manifest.json` and the fixed
   `device-lab/test-targets/ground-truth.json` before scanning. Expected values
   must never come from a Scanly result.
4. Open `/device-lab` over HTTPS. Use a tester-declared device model if the
   browser cannot report one reliably; never infer a model from the user agent.
5. Do not capture or commit faces, addresses, serial numbers, private screens,
   or camera-roll images. Metadata-only evidence is preferred.

## Scenario execution

Execute P1-P12 and N1 exactly as defined by the manifest on every required
physical device, and retain each scenario exactly once. Missing, unsupported,
unavailable, and failed results stay visible; they are never removed to make a
session pass.

- P1 records payload/format, TTFD, and TTFC.
- P2 records QR, Data Matrix, PDF417, Code 128, and EAN-13 separately.
- P3 records near/medium/far distance as `tester-measured` or
  `tester-estimated`; the sources are not interchangeable.
- P4 records 0°, approximately 20°, and approximately 40° as
  `tester-estimated`.
- P5 describes normal, dim, and screen-illuminated dark environments. Do not
  record lux without a real meter.
- P6 records captured/admitted/dropped/quality-rejected frames and TTFC during
  real handheld motion.
- P7 reports the actual glare result from a screen or reflective surface.
- P8 records distance, camera resolution, zoom, and result for `qr-small`.
- P9 presents at least four physical targets and records expected/decoded count,
  formats, and payload completeness.
- P10 presents both same-payload targets and requires distinct
  `physicalInstanceId` values.
- P11 records identity switches, fragmentation, and false tracks while at least
  two physical targets move.
- P12 sets the expected count before scanning and records confirmed physical
  instances, completion, and false completion.
- N1 observes desk, keyboard, wall, fabric, non-barcode packaging, and a screen
  without a barcode for a sustained camera session. Its confirmed count must be
  zero.

Any false confirmed scan makes the physical evidence fail closed, including a
false confirmation attached to a scenario already marked failed.

## Camera lifecycle and capabilities

Preserve the browser-returned `MediaTrackSettings`, `MediaTrackCapabilities`,
and `MediaTrackConstraints` without filling missing capability values by hand.

- Permission: preserve one strictly time-ordered
  `initial-prompt -> deny -> retry -> grant` audit on at least one physical
  device. Denial must produce typed `camera_permission_denied`; retry and grant
  must demonstrate a recoverable transition back to scanning. Every step and
  the summary must record zero unhandled rejections. Append a revoke observation
  only after grant when the OS/browser permits it; otherwise record
  `revoke: unavailable` without inventing a revoke step.
  Other physical sessions may record the lifecycle as `not-tested` or
  `unavailable` with an empty audit trail; only a complete passing audit can
  satisfy the Foundation permission gate.
- Switching: rear → front → rear on a capable phone. Preserve browser-reported
  device ID, facing mode, label, and settings for each step; the first and final
  rear device IDs must match and differ from the front device ID. Also verify
  the old track stops, the new track is live, generation is invalidated, and
  stale public results are zero.
- Orientation: portrait → landscape → portrait. Verify decoded, tracking, and
  overlay geometry plus frame dimensions; scan success alone is insufficient.
- Background/foreground: run this on iOS and Android and record track, scanner,
  and Worker state, recovery time, and stale results. The outcome may be
  `RECOVERED`, `EXPLICIT_RESTART_REQUIRED`, or `FAILED`, but never a silent dead
  state.
- Torch: if the camera API reports `torch: true`, test on and off; otherwise
  record `UNSUPPORTED`.
- Zoom: when exposed, record min/max/current and test manual zoom, auto zoom,
  manual override, and cooldown. A successful constraint request is not proof
  of zoom: PASS requires `MediaTrackSettings.zoom` to show the applied change.
  Cooldown evidence must show at least one confirmed observation with unchanged
  browser-reported zoom and no auto-zoom operation inside the cooldown, then a
  later reported zoom increase after the cooldown.
- Focus: test only when the browser exposes controllable focus; otherwise record
  `UNAVAILABLE`.

## Network isolation

After the page and WASM are loaded, disable network access and continue a real
camera scan. Record that scanning continued, the expected payload was decoded,
and neither barcode pixels nor payload were uploaded. This establishes a local
decode path; it does not claim full PWA/offline installation support.

## Thirty-minute physical-mobile soak

The Foundation soak must run on a real iPhone/iPad or Android device with a
physical camera active for at least 30 continuous minutes. A desktop webcam,
simulated frames, or 30 minutes aimed only at an inert black scene does not
qualify. Periodically present the basic, multi-code, moving-target, and negative
scenes.

Record start/end/duration; captured, admitted, and dropped frames; decode
attempts; confirmed scans; false confirmations; suppressed repeats; camera
track endings; scanner and Worker restarts; errors; stale public events; and all
final active/pending/native/WASM/controlled resource counters. Preserve first,
middle, and last five-minute windows with TTFD/TTFC where applicable, decode
P50/P95, effective decode FPS, and frame-drop rate. These values establish a
baseline; they are not a fabricated commercial threshold.

The first activity marker must equal the soak start, markers must be strictly
increasing with no gap over 10 minutes, and the final marker must be within 10
minutes of soak end. Each of basic, multi-code, moving, and negative must appear
in both the first and second half. Every marker interval must strictly increase
captured/admitted/decode counters, and the negative marker must be followed by
another real scene so its interval is non-zero. Liveness samples at intervals
of 10 seconds or less must cover the exact soak start and end, show a
live/scanning camera throughout, and retain monotonic frame counters. A
qualifying soak also requires non-zero captured/admitted frames and decode
attempts, zero false confirmations, and zero stale public events.

Manual marker labels are not proof of scene activity. Every basic interval must
contain a runtime-confirmed `qr-basic` payload/format/physical identity; every
multi-code interval must contain the four fixed P9 targets in one observation
frame; every moving interval must preserve one runtime physical identity across
increasing frames with non-zero geometry displacement and zero identity,
fragmentation, or false-track failures; and every negative interval must bind
its exact marker boundaries to positive frame/decode deltas and a zero confirmed
scan delta. The verifier rejects a qualifying soak when any interval lacks this
runtime observation evidence.

Process memory or chip temperature must not be invented. Thermal source is
`tester-observed`, `OS-reported`, `external-measured`, or `unavailable`, with
qualitative warmth/throttling/degradation notes. Battery percentage, duration,
brightness, and charging state are `tester-recorded` when available and must not
be converted into guessed watts or mAh.

## Review and admission

The Device Lab export is always a review-required draft. Admission is a separate
operation:

1. Compare every result with the fixed Ground Truth and retain all 13 unique
   scenario IDs.
2. Review evidence type, physical metadata and field sources, raw camera
   capability data, lifecycle/network observations, and any soak qualification.
3. Confirm that the exact source was clean and that deployment identity, when
   used, is a non-local HTTPS URL and resolves to the same commit/tree/version.
4. Complete sensitive-data and rights review before setting the corresponding
   flags to true. Keep reviewed JSON metadata rather than raw imagery.
5. Store the schema-valid record in `device-evidence/sessions/`, synchronize
   `device-evidence/status.json` with admissible exact-source Foundation counts
   (historical evidence remains separately reportable), and run:

   ```text
   npm run device:targets:verify
   npm run device:evidence:verify
   npm run benchmark:device
   ```

The verifier fails closed for incomplete metadata, missing or duplicate
scenarios, a physical record carrying any simulated/emulated/synthetic marker,
any false confirmation, a short soak claimed as qualifying, or source identity
mismatch. A rejected record cannot advance status.

If runtime code changes after a physical run, retain the old evidence as
historical. Create a new evidence ID and rerun affected physical scenarios and
N1 against the new exact source; rerun the 30-minute soak when lifecycle or
resource code changed materially.

## Gate interpretation

The Beta 4 Foundation minimum is reached only when admitted evidence contains:

- at least one real iOS Safari physical-mobile session;
- at least one real Android Chrome physical-mobile session;
- P1-P12 and N1 executed on those required devices with zero false confirmed
  scans; and
- at least one qualifying physical-mobile camera soak of at least 30 minutes,
  with zero stale public events and all final controlled resources at zero.

Only then may `physicalValidationStatus` become
`PHYSICAL_DEVICE_VALIDATION_STARTED_AND_MINIMUM_GATE_PASSED`. This is not full
matrix completion. The
two-iPhone-generation, Android lower/mid/flagship, and desktop-webcam matrix in
Issue #13 remains open until genuinely covered; report
`FULL_DEVICE_MATRIX_PENDING` while any of those classes remain untested.

Until that final RC campaign, the repository status remains
`PHYSICAL_DEVICE_VALIDATION_DEFERRED_TO_RC`; integration completion must never
be interpreted as physical-device or release completion.
