# Branch consolidation audit (2026-08-06)

> **Historical pre-consolidation audit. Superseded by [branch-consolidation-2026-08-07.md](branch-consolidation-2026-08-07.md). Do not use this document as current branch state.**

This record is based on git fetch --all --tags --prune and the remote tips
observed on 2026-08-07. main was read-only throughout the audit.

## Remote inventory

| Branch | Tip SHA | Merge base with develop/sdk-v2 | Behind / ahead | Related PR |
| --- | --- | --- | --- | --- |
| origin/main | a96ec1731c4247e0121f3d25d65b57adc7f9cf7d | a96ec1731c4247e0121f3d25d65b57adc7f9cf7d | 26 / 0 | none |
| origin/develop/sdk-v2 | b3ac2c46371992c3821fb36170afe8e251d0c7be | b3ac2c46371992c3821fb36170afe8e251d0c7be | 0 / 0 | none |
| origin/architecture/sdk-v2-alpha5-multisymbology-foundation | ba51a1b5814d72aed8533b74473a0d539b387bc0 | b3ac2c46371992c3821fb36170afe8e251d0c7be | 0 / 12 | #9 |
| origin/dependabot/github_actions/actions/setup-node-7 | e2940452920faa9907f74836e1da0dec2cb719d6 | a96ec1731c4247e0121f3d25d65b57adc7f9cf7d | 26 / 1 | #10 |
| origin/dependabot/npm_and_yarn/development-dependencies-aa4870cdfd | fa46d5aa8e399a60190b0c6e7e2aabf9389e79b7 | a96ec1731c4247e0121f3d25d65b57adc7f9cf7d | 26 / 1 | #12 |
| origin/dependabot/npm_and_yarn/production-dependencies-356d6101a9 | 4fc34b68e5d8e019a1837101742b77a51e5fdfcd | a96ec1731c4247e0121f3d25d65b57adc7f9cf7d | 26 / 1 | #11 |

main is an ancestor of develop/sdk-v2 and has no unique commits in this
comparison. It remains protected and its tip SHA is unchanged.

## Branch classification and deletion eligibility

| Branch | Unique-work classification | Integration decision | Deletion eligibility |
| --- | --- | --- | --- |
| main | integrated in develop/sdk-v2 ancestry | preserve unchanged | never |
| develop/sdk-v2 | long-lived integration base | preserve | never |
| architecture/sdk-v2-alpha5-multisymbology-foundation | integrated on the consolidation branch, except the blocked real-photo/evidence work | merge only through verified PR #9 | only after PR #9 and merged-develop checks pass |
| dependabot/github_actions/actions/setup-node-7 | semantically integrated on the current Alpha.5 workflows | do not merge stale history | only after PR #10 is closed and PR #9 is merged |
| dependabot/npm_and_yarn/production-dependencies-356d6101a9 | superseded or intentionally deferred package by package | reject grouped stale branch | only after PR #11 is closed and PR #9 is merged |
| dependabot/npm_and_yarn/development-dependencies-aa4870cdfd | intentionally deferred to Beta/toolchain work | reject grouped stale branch | only after PR #12 is closed and PR #9 is merged |

## Unique commit classification

### Alpha.5 consolidation branch

The 12 unique commits are:

    e4e1c1a feat(alpha5): add multi-symbology barcode foundation
    797de2a feat(alpha5): add measured multisymbology validation
    95b44b4 test(alpha5): cover browser main-thread formats
    5dcb1ee fix(alpha5): complete multisymbology release gates and evidence pipeline
    7826677 Document external open-license benchmark validation
    b2f7665 fix(alpha5): harden reproducibility and release gates
    0628bf3 docs(alpha5): record release hardening no-go
    b1b0d19 fix(alpha5): preserve generated manifest line endings
    1e3ab07 docs(alpha5): update no-go assessment after drift fix
    858b21e docs(alpha5): record exact-sha remote no-go
    26b5fb5 docs(alpha5): record remaining remote blockers
    ba51a1b Alpha 5

Decision: integrated in the consolidation branch, pending Source Commit
checks and the real-photo release gate. The branch is deletion-eligible only
after PR #9 is merged and merged-develop checks pass.

Changed files are grouped as follows: Alpha.5 core/router/engine source and
package outputs; Alpha.5 generated and negative fixture corpus; the 19 legacy
QR fixture files listed below; scenario/API/package/browser tests; workflow
and benchmark lifecycle scripts; release and benchmark documentation; and
package.json/package-lock.json. The last tip also added 13 tracked
.alpha5-* diagnostics, which are classified as obsolete and removed by the
consolidation fix.

### Dependabot setup-node branch

Unique commit e2940452920faa9907f74836e1da0dec2cb719d6 changes only
.github/workflows/benchmark.yml and .github/workflows/ci.yml from
actions/setup-node@v4 to @v7.

Decision: integrated semantically by applying @v7 to all current v2
workflows with explicit npm cache inputs. The stale branch history is not
merged. PR #10 is deletion-eligible after its disposition is documented.

### Dependabot production branch

Unique commit 4fc34b68e5d8e019a1837101742b77a51e5fdfcd changes
package.json and package-lock.json with six grouped updates.

Decision: deferred as a group; no stale branch history is merged. The
per-package disposition is recorded below.

### Dependabot development branch

Unique commit fa46d5aa8e399a60190b0c6e7e2aabf9389e79b7 changes
package.json and package-lock.json with nine grouped updates.

Decision: deferred as a group; no stale branch history is merged. The
per-package disposition is recorded below.

## Legacy fixture audit

The 19 changed files were:

    fixtures/20-low-contrast-02.png
    fixtures/21-underexposed-gen.png
    fixtures/22-overexposed-gen.png
    fixtures/23-blur-gen.png
    fixtures/24-motion-blur.png
    fixtures/25-noise.png
    fixtures/26-glare-gen.png
    fixtures/29-rot-90.png
    fixtures/30-rot-180.png
    fixtures/31-rot-270.png
    fixtures/32-rot-15.png
    fixtures/37-occlusion.png
    fixtures/38-damaged-gen.png
    fixtures/40-moire.png
    fixtures/48-perspective-mild.png
    fixtures/49-noise-dark.png
    fixtures/51-gamma-ish.png
    fixtures/63-negative-truncated.png
    fixtures/74-zxing-contribution-blur.png

Each file was compared against the develop/sdk-v2 blob after decoding to
RGBA pixels. All pixels and dimensions were identical; only Sharp 0.35.3
PNG re-encoding changed the bytes. The generator and fixture contract did
not change for these files, so the original blobs were restored. The
generator now preserves an existing PNG when generated pixels are identical,
which makes the approved generator deterministic across the supported
Sharp encoders. Two generator runs are required to produce zero drift.

## Dependency decisions

| Package/update | Decision | Reason and milestone | Security impact |
| --- | --- | --- | --- |
| actions/setup-node@7 | integrated | Current workflows retain explicit npm cache behavior and support Node 20/24 matrices. | Current official major applied; workflow contract tests pass. |
| next 14.2.35 -> 16.2.12 | deferred | Next 15.5.22 is already on Alpha.5; Next 16 requires a dedicated framework/API/browser/Vercel migration. Beta. | Current Alpha.5 lockfile has no npm audit finding. |
| react 18.3.1 -> 19.2.8 | deferred | Coupled React DOM, types, Next and adapter migration. Beta. | Current Alpha.5 lockfile has no npm audit finding. |
| react-dom 18.3.1 -> 19.2.8 | deferred | Coupled with React 19 and Next migration. Beta. | Current Alpha.5 lockfile has no npm audit finding. |
| @types/react 18.3.3 -> 19.2.17 | deferred | Must follow React 19 migration. Beta. | Type-only change; no current npm audit finding. |
| @types/react-dom 18.3.0 -> 19.2.3 | deferred | Must follow React DOM 19 migration. Beta. | Type-only change; no current npm audit finding. |
| @zxing/browser 0.1.5 -> 0.2.1 | superseded | The package is absent from Alpha.5; ZXing-C++ WASM is primary and the existing ZXing-JS fallback contract is unchanged. | No shipped Alpha.5 dependency is left at the stale branch version. |
| @zxing/library 0.21.3 -> 0.23.0 | deferred | API and fallback semantics were not independently validated; defer the fallback migration to Beta. | Current Alpha.5 lockfile has no npm audit finding. |
| sharp 0.34.5 -> 0.35.3 | already superseded | Alpha.5 already pins Sharp 0.35.3 and its lockfile; PNG byte differences were handled as an encoding reproducibility issue. | Proposed version is already present and audited. |
| @axe-core/playwright 4.10.2 -> 4.12.1 | deferred | Non-security tooling change is outside the Alpha.5 evidence scope; validate with the Beta browser toolchain. | Current Alpha.5 lockfile has no npm audit finding. |
| @playwright/test 1.58.2 -> 1.62.0 | deferred | Browser engine/toolchain changes can alter E2E and browser benchmark reproducibility. Beta. | Current Alpha.5 lockfile has no npm audit finding. |
| @types/node 20.14.10 -> 26.1.2 | deferred | Alpha.5 supports Node 20-24; Node 26 types would misrepresent the supported runtime range. Beta. | Type-only change; no current npm audit finding. |
| @vitest/coverage-v8 3.2.4 -> 4.1.10 | deferred | Coupled Vitest 4 major. Beta. | Current Alpha.5 lockfile has no npm audit finding. |
| eslint 8.57.0 -> 10.8.0 | deferred | Ecosystem-wide major migration. Beta/toolchain branch. | Build-time tool; no current npm audit finding. |
| eslint-config-next 14.2.35 -> 16.2.12 | deferred | Alpha.5 already uses 15.5.22; the proposed version is coupled with Next 16 and ESLint 10. Beta. | Build-time tool; no current npm audit finding. |
| typescript 5.5.3 -> 7.0.2 | deferred | Compiler major requires a dedicated toolchain migration. Beta. | Build-time compiler; no current npm audit finding. |
| vitest 3.2.4 -> 4.1.10 | deferred | Coupled with coverage and test-runner behavior. Beta/toolchain branch. | Build-time tool; no current npm audit finding. |

.github/dependabot.yml now targets develop/sdk-v2, separates production
and development minor/patch groups, limits open PRs, ignores the documented
Alpha.5-incompatible framework/compiler majors, and leaves security updates
enabled.

## Photo gate status

fixtures/alpha5/project-photos/manifest.json is empty and contains no image
files. A read-only search of all repository worktrees plus the accessible
Pictures, Downloads, and Desktop paths found no authentic local project
photographs. The required 12-photo corpus (at least three each for Data
Matrix, PDF417, Code 128/GS1-128, and EAN/UPC) is therefore unavailable.

Status at the prior audit: photo validation was unavailable. The later project
decision separates the modes: Alpha.5 integration is `ALPHA5_INTEGRATION_GO`
when all non-photo gates pass; release remains `ALPHA5_RELEASE_NO_GO` and
real-photo/physical-camera evidence is `DEFERRED_TO_BETA1`. No fabricated or
downloaded images were added, and no Alpha.5 release baseline is activated.

The local generated corpus completed 136/146 fixtures with zero false
positives, zero accepted format misclassifications, 12/12 mixed-format
completeness, 100% generated-clean per-format recall, and at least 85.7%
generated-difficult per-format recall. Legacy QR development gates completed
at Fast 62/74, Balanced 73/74, and Robust 73/74 with zero false positives,
timeouts, or engine failures. These development results are not Canonical
Evidence and do not satisfy the missing project-photo gate.

## Historical deletion authorization state

At the time of this audit, deletion had not yet been authorized. The audit
required final tip SHAs, PR dispositions, the merge commit, evidence
IDs/hashes, and the result of `git branch -r --no-merged
origin/develop/sdk-v2` before deletion. Those later consolidation facts are
recorded in the superseding 2026-08-07 authority.

The later consolidation proved that obsolete unique commits were ancestors of
`develop/sdk-v2`, were semantically reapplied, or were deliberately rejected
and documented. `main` and `develop/sdk-v2` were never deletion candidates.
