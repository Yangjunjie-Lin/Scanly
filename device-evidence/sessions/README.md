# Reviewed session records

This directory accepts only reviewed, schema-valid evidence from an actual
session. Device Lab downloads are deliberately marked as drafts and must not be
renamed into this directory without review.

Use a stable ID such as
`beta4-physical-ios-YYYYMMDD-<short-hash>`,
`beta4-physical-android-YYYYMMDD-<short-hash>`, or
`beta4-physical-soak-YYYYMMDD-<short-hash>`, and use the same value for the JSON
filename and `evidenceId`.

Before admission, confirm that:

- `sourceCommit`, `sourceTree`, and `sdkVersion` identify the exact clean source
  used by the session; deployment-backed sessions also identify that exact
  deployment;
- evidence type and hardware access agree, and no simulated, emulated,
  synthetic, spoofed, or desktop input is labelled `physical-mobile`;
- remote physical evidence retains provider/session/device identity plus a
  provider-reported, non-local HTTPS attestation URL and its SHA-256;
- physical device, OS, browser, and raw `MediaTrackSettings`,
  `MediaTrackCapabilities`, and `MediaTrackConstraints` metadata are present
  with truthful field sources;
- P1-P12 and N1 each appear exactly once, including failed, unsupported, or
  unavailable observations, and every Ground Truth comparison still matches
  the fixed pre-scan target manifest;
- an executed permission audit preserves
  `initial-prompt -> deny -> retry -> grant` with strictly increasing
  timestamps, typed `camera_permission_denied`, a recoverable grant after
  retry, zero unhandled rejections, and an optional post-grant revoke step only
  when supported; an honestly unexecuted audit uses `not-tested` or
  `unavailable` with no synthetic steps;
- false confirmed scans are zero across every scenario and long run;
- a soak claimed for the Foundation gate used a continuously active physical
  mobile camera for at least 30 minutes, exercised positive, multi-code, moving,
  and negative scenes, bound each marker to its required runtime confirmation,
  same-frame target set, tracked displacement, or zero-confirm negative
  interval, and ended with zero stale events and zero controlled resources; and
- sensitive-data and rights reviews really occurred. Prefer metadata, hashes,
  metrics, Ground Truth, and results; do not commit raw camera imagery.

After copying the reviewed record, synchronize `device-evidence/status.json`
with admissible exact-source cohort counts derived by the verifier and run
`npm run device:evidence:verify` followed by
`npm run benchmark:device`. A rejected record stays out of this directory; its
failure must not be converted into PASS or hidden by deleting scenario results.

There is no reviewed physical-device result in this directory while status is
`PHYSICAL_DEVICE_VALIDATION_DEFERRED_TO_RC` and its physical counts are zero.
