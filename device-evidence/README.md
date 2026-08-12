# Device evidence

This directory stores privacy-reviewed metadata from manual camera runs. The
current repository state remains `DEVICE_MATRIX_PARTIAL` /
`PHYSICAL_DEVICE_VALIDATION_PENDING` until admissible physical evidence is
actually committed. CI validates claims; it does not create physical evidence.

## Truth boundary

- `schema.json` is the fail-closed admission contract.
- `sessions/` contains reviewed session JSON only. A Device Lab export is a
  review-required draft, not evidence that may be counted immediately.
- `manifests/` contains immutable per-session protocol/Ground Truth identity
  records or hashes when they are needed to reproduce the review.
- `status.json` is a summary of admitted records. Counts and gate status must
  agree with what the verifier derives from `sessions/`.

Evidence types are never promoted. `simulated`, `desktop-camera`,
`physical-mobile`, and `remote-physical-device` describe different acquisition
paths. An emulator, simulator, user-agent override, Playwright fake camera,
Internet photograph, synthetic frame, or desktop webcam cannot satisfy a
physical-mobile requirement. A remote session qualifies only when the provider
confirms that it ran on real hardware and the record uses the remote physical
hardware contract. That contract requires provider identity, provider session
and device IDs, an explicit real-hardware attestation URL plus its SHA-256, and
`provider-reported` field sources; selecting a remote hardware enum or typing a
generic provider name is not sufficient.

Every admitted record binds the clean source that was actually tested through
`sourceCommit`, `sourceTree`, and `sdkVersion`. A deployment-backed run also
records its deployment URL/ID and exact Git commit. The evidence-storage commit
may be newer than the tested commit; the tested source identity may not be
rewritten to match it. Evidence for an older source is retained as historical
evidence but cannot prove an exact-source release after runtime code changes.
`status.json` and the benchmark report's primary Foundation counts include only
admissible exact-source physical-mobile cohorts; benchmark
`historicalTotals` keeps older or other evidence visible without promoting it.

## Review and admission

1. Export the review-required draft from `/device-lab`; do not edit it into a
   PASS before the physical run is complete.
2. Confirm the hardware class and field provenance. Device model must be
   `declared-by-tester` when the browser cannot report it reliably; it must
   never be inferred from a user agent.
3. Compare every P1-P12 result with the fixed, pre-scan Ground Truth and review
   N1, capability, lifecycle, network-isolation, soak, thermal, and battery
   observations. Missing, duplicate, unsupported, and failed results remain
   visible rather than being removed.
   A session that executed permission testing requires the time-ordered
   `initial-prompt -> deny -> retry -> grant` audit: denial must surface
   `camera_permission_denied`, retry/grant must recover to scanning, and every
   step plus the summary must record zero unhandled rejections. Append revoke
   only when the platform permits it; otherwise retain `revoke: unavailable`.
   Other sessions may honestly retain `status: not-tested` or `unavailable`
   with no audit steps; they do not satisfy the Foundation permission gate.
4. Verify the exact clean source/deployment identity and review the metadata for
   sensitive data and capture rights. Set `sensitiveDataReviewed` and
   `rightsReviewed` only after those reviews actually occur. Do not commit raw
   camera frames, faces, addresses, serial numbers, or unredacted screens.
   Deployment-backed evidence requires its real non-local HTTPS URL, deployment
   ID, and exact Git commit; localhost runs omit `deployment` and bind current
   repository HEAD/tree instead.
5. Convert the reviewed draft to the schema version accepted by
   `sessions/`, update `status.json` to the derived counts/status, and run:

   ```text
   npm run device:targets:verify
   npm run device:evidence:verify
   npm run benchmark:device
   ```

If any command fails, the record is not admitted and the public status is not
advanced. The verifier rejects, among other things, incomplete device metadata,
missing or duplicate scenarios, simulated/emulated/synthetic physical claims,
false confirmations, short qualifying soaks, and source commit/tree mismatch.

## Beta 4 Foundation minimum

The minimum Foundation gate requires all of the following admitted evidence:

- at least one real iOS Safari `physical-mobile` session;
- at least one real Android Chrome `physical-mobile` session;
- P1-P12 and N1 executed and retained for each required physical session;
- zero false confirmed scans; and
- at least one real, camera-active, physical-mobile soak lasting 30 minutes or
  longer, with exact start/end liveness coverage, a non-zero negative-scene
  interval, runtime-confirmed basic/four-code/moving activity in every labelled
  interval, non-zero real frame/decode activity, zero stale public events, and
  zero final controlled resources.

Only then may the status advance to
`PHYSICAL_DEVICE_VALIDATION_STARTED_AND_MINIMUM_GATE_PASSED`. That status does
not mean the full Device Matrix is complete. Until the remaining Issue #13
device classes are covered, the matrix remains partial and the issue remains
open. With no qualifying hardware evidence, the honest result is
`BLOCKED_EXTERNAL_PHYSICAL_HARDWARE` and
`PHYSICAL_DEVICE_VALIDATION_PENDING`.
