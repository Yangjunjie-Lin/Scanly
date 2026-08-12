# Device evidence

This directory stores privacy-reviewed metadata for manual camera runs. No physical session is committed at Beta 4 harness initialization; the truthful state is `DEVICE_MATRIX_PARTIAL` / `PHYSICAL_DEVICE_VALIDATION_PENDING`.

- `schema.json` defines the fail-closed evidence contract.
- `sessions/` accepts reviewed JSON records only. Images, camera rolls, faces, addresses, serial numbers, and unredacted screens must not be committed.
- `manifests/` stores immutable copies or hashes of the protocol and Ground Truth used by a session.

Evidence types are never promoted: simulated, desktop camera, locally tested physical mobile, and remote physical hardware remain distinct. Emulator, user-agent spoofing, Playwright camera simulation, photographs from the Internet, and desktop webcams cannot satisfy physical-mobile evidence.

Each session points to the clean `sourceCommit` and `sourceTree` actually tested. A later evidence-only commit may store that result; the verifier validates the referenced Git object rather than forcing a circular self-reference. Manual fields require an entry in `fieldSources` using `declared-by-tester`, `browser-reported`, `camera-api-reported`, `tester-observed`, `OS-reported`, `external-measured`, or `unavailable`.

Run:

```text
npm run device:evidence:verify
npm run benchmark:device
```

The verifier permits an empty `sessions/` directory only when the matrix remains explicitly pending. Any claimed physical record that lacks hardware session metadata, Ground Truth, exact source identity, or privacy review fails closed.
