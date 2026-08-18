# Scanly SDK v2 RC2 final-validation candidate

RC2 is a new candidate family based on the RC1 merge commit. `release/rc1/`
and tag `v2-rc1-r1` remain historical and immutable. RC2 evidence is bound to
the exact source commit and tree recorded in `rc2-candidate-manifest.json`.

The physical matrix is fail-closed. `NOT_TESTED` is not a pass and cannot be
used for a Stable release. No simulator, emulator, browser automation,
static image, video, or user-agent override is admissible as physical evidence.
Raw private camera video is not committed; reviewed metadata, hashes, Ground
Truth, and measured results are preferred.

Current decision in this checkout:

```text
RC2_SOFTWARE_GO
RC2_PHYSICAL_NO_GO
RC2_SIGNING_NO_GO
V2_STABLE_RELEASE_NO_GO
BLOCKED_EXTERNAL_PHYSICAL_HARDWARE
BLOCKED_EXTERNAL_RELEASE_CREDENTIALS
```
