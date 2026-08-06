# SDK v2 branch consolidation (2026-08-07)

This is the authoritative record for the Alpha.5-to-Beta 1 branch transition in
`Yangjunjie-Lin/Scanly`. `main` was never checked out for a write and remains
the v1.3 Stable line.

## Initial remote inventory

Snapshot captured after `git fetch --all --prune`, before consolidation writes:

| Branch | Head SHA | Ahead / behind develop | PR | Mergeability | Decision |
| --- | --- | ---: | --- | --- | --- |
| `main` | `a96ec1731c4247e0121f3d25d65b57adc7f9cf7d` | 0 / 26 | — | protected | preserve unchanged |
| `develop/sdk-v2` | `b3ac2c46371992c3821fb36170afe8e251d0c7be` | 0 / 0 | — | — | authoritative integration base |
| `architecture/sdk-v2-alpha5-multisymbology-foundation` | `5f01a5fc5782eb918839ed64b0963da4b7518c5d` | 13 / 0 | #9 | mergeable, Draft | merge with history-preserving merge commit |
| `dependabot/github_actions/actions/setup-node-7` | `e2940452920faa9907f74836e1da0dec2cb719d6` | 1 / 26 | #10 | mergeable | superseded; do not merge |
| `dependabot/npm_and_yarn/production-dependencies-356d6101a9` | `4fc34b68e5d8e019a1837101742b77a51e5fdfcd` | 1 / 26 | #11 | mergeable | defer grouped majors to Beta 1 |
| `dependabot/npm_and_yarn/development-dependencies-aa4870cdfd` | `fa46d5aa8e399a60190b0c6e7e2aabf9389e79b7` | 1 / 26 | #12 | mergeable | defer toolchain majors to Beta 1 |

## Alpha.5 consolidation

- PR: **#9**, head SHA `0aa809bda007783d0858b08d07f9a36902dd3471` after the
  integration-policy commit.
- Base SHA before merge: `b3ac2c46371992c3821fb36170afe8e251d0c7be`.
- Merge method: **merge commit**, preserving all Alpha.5 commit history.
- Merge commit: `b0fd251996690fef80909cf972dc28a18e5e2207`.
- Alpha.5 head is an ancestor of `develop/sdk-v2`; `main` remains unchanged.
- Local non-photo validation passed: install, WASM verification, deterministic
  fixture/scenario generation with zero drift, static quality, docs, lint,
  typecheck, unit tests (267/267), and the integration symbology gate.
- Generated corpus: 146 (100 single-format positives, 12 mixed, 34 negative),
  clean 15/15, difficult 75/85, mixed 12/12, GS1 8/8, false positives 0,
  accepted-format misclassifications 0, invalid-checksum acceptances 0.
- Legacy QR suite remains unchanged. Alpha.4 r4 is still the last fully frozen
  release evidence; no Alpha.5 baseline was activated.

## Two-level release decision

`ALPHA5_INTEGRATION_GO` is valid for the consolidated development branch when
all non-photo quality checks pass. The project-owned corpus is **0/12**, with
no authentic photographs added or fabricated, so physical-camera and
real-photo validation are `DEFERRED_TO_BETA1`.

`ALPHA5_RELEASE_NO_GO` remains in force: no Alpha.5 tag, GitHub Release, npm
publication, Stable/Latest claim, canonical evidence freeze, or immutable
Alpha.5 baseline activation is authorized.

## Dependabot dispositions

| PR | Resolution | Unique work | Branch |
| --- | --- | --- | --- |
| #10 | closed as superseded | `actions/setup-node@v7` already exists in active workflows | deleted after closure |
| #11 | closed, deferred to Beta 1 | split ZXing-JS, Next/React, and Sharp compatibility work | deleted without merge |
| #12 | closed, deferred to Beta 1 | split TypeScript/Node types, ESLint, Vitest/coverage, Playwright/accessibility, and Next lint work | deleted without merge |

No stale Dependabot history was merged and no grouped dependency migration was
performed during Alpha.5 consolidation.

## Branch cut

The Beta 1 branch is created only after final develop validation:

`architecture/sdk-v2-beta1-realtime-scanner-foundation`

Its base is the exact final remote `develop/sdk-v2` SHA recorded in the final
Chinese consolidation report. The branch is a planning boundary only; no Beta 1
scanner implementation is included and no release tag/package was created.

## Deferred Beta 1 registry

Planning issues cover:

1. At least 12 authentic project-owned photographs (three each for Data Matrix,
   PDF417, Code 128/GS1-128, and EAN/UPC), with exact payload, device metadata,
   lighting, distance, angle, blur/exposure class, and provenance/license.
2. Real-time scanner runtime: frame-quality filtering, blur/glare assessment,
   bounded profile escalation, multi-frame confirmation, repeat suppression,
   ROI reuse, focus/torch/zoom capability handling, and continuous-session
   semantics.
3. Isolated dependency/toolchain migrations: ZXing-JS; Next/React; Sharp;
   TypeScript/Node types; ESLint; Vitest/coverage; Playwright/accessibility;
   and Next lint integration. Each upgrade group requires its own tests and PR.

