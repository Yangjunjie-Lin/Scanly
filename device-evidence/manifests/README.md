# Session manifests

Store immutable, privacy-reviewed protocol identity metadata here when a
physical session needs a per-session manifest. A manifest records which fixed
Device Lab protocol, Ground Truth, target-byte hashes, source identity, and (if
applicable) deployment were used; it must not redefine expected payloads after
scanning.

Every referenced target ID must exist in
`device-lab/test-targets/ground-truth.json`, and the recorded Ground Truth and
target hashes must be those presented to the tester. Link the manifest to the
same `evidenceId`, `sourceCommit`, `sourceTree`, and `sdkVersion` as its reviewed
session. For Vercel or device-farm runs, retain the deployment URL/ID, exact Git
commit, provider/session/device identity, and a provider-reported real-hardware
attestation needed by the admission review.

If source code changes after a session, keep the old manifest and session as
historical evidence. Create a new evidence ID and rerun affected physical
scenarios plus N1; rerun the 30-minute soak when lifecycle or resource code
changed materially. Never rewrite an old manifest to make it appear to cover a
new source.
