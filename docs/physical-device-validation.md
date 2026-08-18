# Scanly v2.0.0 Post-release Physical Device Validation Protocol

## Current state and qualification target

The current physical validation gate is
`POST_RELEASE_VALIDATION_PENDING`. This is a pending qualification state, not
a PASS. No reviewed physical-device evidence has been admitted, so all current
physical counts remain zero and the full matrix remains
`FULL_DEVICE_MATRIX_PENDING`.

This protocol qualifies the immutable v2.0.0 release surfaces:

- Production Web: <https://qr-decoder-theta.vercel.app>
- Native iOS: the released v2.0.0 source package
- Native Android: `scanly-sdk-2.0.0.aar`
- Tracking issue: [#13](https://github.com/Yangjunjie-Lin/Scanly/issues/13)

Every result must identify the released artifact, tag, source commit/tree,
deployment, or artifact SHA-256 that was actually exercised. A later
development checkout cannot qualify v2.0.0. The v2.0.0 tag, release assets,
manifest, publication record, packages, and artifacts remain immutable while
qualification evidence is added separately.

The physical evidence contract originated in Beta4. This protocol reuses its
fail-closed Ground Truth, P1-P12 and N1 scenarios, lifecycle checks, and
admission rules for the post-release v2.0.0 qualification target.

## Evidence boundary

Physical evidence must come from an identified, reviewed real-hardware run.

- Automated browser tests are not physical evidence.
- A simulator or emulator is not physical evidence.
- User-agent spoofing is not physical evidence.
- A desktop webcam cannot satisfy a physical-mobile requirement.
- Internet photos cannot satisfy a physical-mobile requirement.
- Playwright fake cameras, synthetic frames, and prerecorded substitutions are
  not physical evidence.

Evidence types remain distinct:

- `simulated`: deterministic or automated execution without physical camera
  hardware.
- `desktop-camera`: an actual desktop or laptop camera; never physical-mobile
  evidence.
- `physical-mobile`: a locally accessed physical phone or tablet.
- `remote-physical-device`: real hardware accessed through a device farm, with
  provider, provider session/device identity, a real-hardware attestation URL,
  and attestation SHA-256 retained for review.

CI verifies admitted claims but cannot manufacture evidence or promote a
pending state. Missing, failed, unsupported, unavailable, and `NOT_TESTED`
results stay visible.

## Preparation and Ground Truth

1. Select the released v2.0.0 surface and record its exact identity before the
   run. Web sessions record the production URL, deployment ID, and deployed Git
   commit. Native Android sessions record the released AAR SHA-256. Native iOS
   sessions record the immutable v2.0.0 tag, commit, tree, and package identity.
2. Run `npm run device:targets:verify` and review
   `device-lab/manifest.json` plus
   `device-lab/test-targets/ground-truth.json` before scanning.
3. Establish expected payloads and formats independently of Scanly output.
   Decoder-generated Ground Truth is inadmissible.
4. Record the actual device, OS, browser/app, camera, settings, capabilities,
   constraints, and field provenance. Never infer the device model from the
   user agent.
5. Prefer metadata, hashes, counters, and reviewed results. Do not commit raw
   camera frames, faces, addresses, serial numbers, private screens, or
   unredacted imagery.

## P1-P12 and N1

Execute P1-P12 and N1 exactly as defined by the device manifest for every
required Web physical device. Native sessions execute the corresponding N1 and
native lifecycle/capability coverage. Retain every required row exactly once.

- P1: record payload, format, time to first decode, and time to first
  confirmation.
- P2: record QR, Data Matrix, PDF417, Code 128, and EAN-13 separately.
- P3: record near, medium, and far distance with a truthful measured or
  estimated source.
- P4: record 0°, approximately 20°, and approximately 40° without inventing
  measurement precision.
- P5: exercise normal, dim, and screen-illuminated dark environments; lux is
  recorded only when obtained from a real meter.
- P6: record captured, admitted, dropped, and quality-rejected frames plus
  confirmation timing during real handheld motion.
- P7: record the observed glare result from a screen or reflective surface.
- P8: record distance, camera resolution, zoom, and result for `qr-small`.
- P9: present at least four physical targets and record expected/decoded
  counts, formats, and payload completeness.
- P10: present two targets with the same payload and retain distinct physical
  instance identities.
- P11: move at least two targets and record identity switches,
  fragmentation, and false tracks.
- P12: set the expected count before scanning and record confirmed physical
  instances, completion, and false completion.
- N1: observe desk, keyboard, wall, fabric, non-barcode packaging, and a screen
  without a barcode during sustained camera use. Confirmed count must be zero.

Any false confirmed scan fails the evidence closed, even when its scenario is
already marked failed.

## Permission and camera lifecycle

At least one physical-mobile session must preserve a strictly time-ordered
permission audit:

`initial-prompt -> deny -> retry -> grant`

Denial must surface typed `camera_permission_denied`; retry and grant must
return to a recoverable scanning state; every step and summary must retain zero
unhandled rejections. Append revoke only when the platform permits it.
Otherwise record revoke as unavailable without inventing an event. Other
sessions may remain honestly `not-tested` or `unavailable`, but they do not
satisfy the Foundation permission gate.

On capable phones, execute and record rear → front → rear camera switching.
The first and final rear identities must match and differ from the front
identity. Preserve returned device ID, facing mode, label, settings, stopped
old tracks, live new tracks, generation invalidation, and zero stale public
results.

Also exercise:

- orientation: portrait → landscape → portrait, including decoded, tracking,
  overlay geometry, and frame dimensions;
- background/foreground: on iOS and Android, record track, scanner, and Worker
  state, recovery time, and stale results;
- torch: test on/off only when the camera API exposes support;
- zoom: record min/max/current and verify applied values through returned
  settings, including manual override and cooldown behavior; and
- focus: test only when the browser or native surface exposes controllable
  focus; otherwise retain `UNAVAILABLE`.

## Network isolation

For Production Web, load the page and WASM, disable network access, and
continue scanning with the real camera. Record that decoding continues, the
expected payload is obtained, and neither barcode pixels nor barcode payloads
are uploaded. This verifies a local decode path; it does not create physical
evidence for any device that did not execute the run.

## Thirty-minute physical-mobile soak

At least one real iPhone/iPad or Android camera must remain continuously active
for 30 minutes or longer. A desktop webcam, simulated input, prerecorded loop,
or inert black scene does not qualify.

Exercise basic, multi-code, moving-target, difficult, and negative scenes.
Record start/end/duration; captured, admitted, dropped, and rejected frames;
decode attempts; confirmations; false confirmations; suppressed repeats;
camera track endings; scanner/Worker restarts; errors; stale public events;
thermal and battery observations; and final active, pending, native, WASM, and
controlled-resource counters.

Preserve first, middle, and last five-minute windows. Runtime observations must
prove each labelled activity: exact target identity for basic, a same-frame
four-target set for multi-code, non-zero geometry displacement with preserved
physical identity for moving, and positive frame/decode deltas with zero
confirmations for negative intervals. Liveness samples no more than ten
seconds apart must cover the exact soak start and end with monotonic counters
and an active scanner/camera. The qualifying run requires non-zero real frame
and decode activity, zero false confirmations, zero stale events, and zero
final controlled resources.

Thermal and battery data must identify their real source. Do not infer process
memory, chip temperature, watts, or mAh.

## Sixty-minute extended soak

Issue #13 also requires a 60-minute extended physical soak against released
artifacts. It uses the same real-camera, activity, liveness, false-positive,
stale-event, lifecycle, thermal/battery, and final-resource rules as the
30-minute soak. Exercise representative basic, multi-code, moving, difficult,
and negative scenes across the full hour and retain first, middle, and last
windows. A 30-minute result cannot be relabelled as the 60-minute result, and
neither result may be synthesized.

## Full device matrix

Issue #13 remains open until reviewed evidence covers the required separate
rows:

| Device class | Required surfaces |
| --- | --- |
| Physical iPhone generation 1 | Web Safari and Native iOS |
| Physical iPhone generation 2 | Web Safari and Native iOS |
| Android lower-end device | Web Chrome and Native Android |
| Android mid-range device | Web Chrome and Native Android |
| Android flagship device | Web Chrome and Native Android |
| Desktop real webcam | Web lifecycle and desktop camera soak |

Web and Native evidence are separate and cannot substitute for each other.
Unsupported hardware capability rows stay unsupported or unavailable. The
matrix status remains `FULL_DEVICE_MATRIX_PENDING` until every required row is
genuinely covered and reviewed.

## Review and admission

The Device Lab export is always a review-required draft. Before admission:

1. Verify the exact released-artifact or production deployment identity and a
   clean source commit/tree where applicable.
2. Verify evidence type, real-hardware provenance, device/browser/app/camera
   metadata, field sources, and any remote-hardware attestation.
3. Compare all scenario results with fixed pre-scan Ground Truth and retain all
   failures, unsupported rows, and unavailable capabilities.
4. Review permission, camera switch, orientation, background/foreground,
   network isolation, soak, thermal, battery, false-confirmation, stale-event,
   and final-resource records.
5. Complete sensitive-data and capture-rights review before setting those
   review flags.
6. Store only the schema-valid reviewed record in
   `device-evidence/sessions/`, update `device-evidence/status.json` from
   verifier-derived counts, and run:

   ```text
   npm run device:targets:verify
   npm run device:evidence:verify
   npm run benchmark:device
   ```

Rejected evidence stays out of the reviewed directory and cannot advance a
count or status.

## Gate interpretation

While the Foundation gate is incomplete, the only truthful current state is
`POST_RELEASE_VALIDATION_PENDING` with verifier-derived physical counts.

The Foundation minimum passes only when one exact released-source cohort has:

- at least one real iOS Safari physical-mobile session;
- at least one real Android Chrome physical-mobile session;
- P1-P12 and N1 retained for the required sessions with zero false confirmed
  scans;
- at least one qualifying 30-minute physical-mobile camera soak;
- a complete passing physical permission lifecycle audit; and
- a verified passing rear → front → rear camera switch with zero stale results.

Only then may `physicalValidationStatus` become
`PHYSICAL_DEVICE_VALIDATION_STARTED_AND_MINIMUM_GATE_PASSED`. That state is not
full-matrix completion and is not permission to close Issue #13. The Issue #13
matrix and 60-minute extended qualification remain independently pending until
admissible evidence proves them.
