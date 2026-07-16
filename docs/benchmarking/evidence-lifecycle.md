# Canonical evidence lifecycle

Scanly keeps development output, CI artifacts, canonical candidates, committed canonical aliases, baseline candidates, and active baselines as distinct evidence classes. Development and CI output is ignored; tracked aliases change only through `benchmark:update-canonical` with explicit approval.

The reproducible flow is:

1. Check out a clean source commit, run deterministic fixture/scenario generation, and require no diff.
2. Run Fast, Balanced, Robust, and Comparison independently with Node 24 on Windows x64, one warmup, and three measured iterations.
3. Assemble the four external artifacts with `benchmark:assemble-canonical`. Assembly validates schemas, source identity, correctness, controlled memory, iteration policy, and SHA-256 hashes, then emits an immutable manifest.
4. From the same clean source checkout, run `benchmark:update-canonical -- --manifest=<path> --approve-canonical-update`. It stages and installs all aliases, the manifest, README summary, and benchmark documentation as one rollback-capable operation.
5. Freeze each profile from that manifest with `benchmark:freeze -- --profile=<profile> --baseline-id=v2-alpha3-rN --canonical-manifest=<path> --approve-baseline`. Freeze uses exclusive file creation and never reads tracked `comparison.json`.
6. Activate all three profiles together with `benchmark:activate -- --baseline-id=v2-alpha3-rN --canonical-manifest=<path> --approve-activation`. Activation verifies one evidence set and atomically replaces the registry. The canonical update, three immutable candidates, and registry are reviewed and committed as one evidence-only change.

## Source and evidence commits

`sourceCommitSha` and `sourceTreeSha` identify the exact code, fixtures, scenarios, lockfile, and benchmark runner used to create the artifacts. A later `evidenceCommitSha` may contain those reports. Between the two commits only `benchmark-results/**`, `docs/benchmark.md`, and the marked README benchmark block may change. Runtime, fixture, scenario, lockfile, workflow, test, or benchmark-tooling changes require a new source run. `benchmark:verify-evidence` enforces this ancestry and path policy.

## Gate modes

`--gate-mode=baseline-candidate` enforces absolute Alpha.3 correctness, memory, timeout, iteration, and completeness contracts without comparing against an older dataset. `--gate-mode=active-baseline` performs normal regression checks against the active runtime-family baseline.

`quality:gates -- --mode=baseline-bootstrap --canonical-manifest=<path>` validates an external candidate without requiring an already-active Alpha.3 baseline. Default/release mode requires synchronized tracked canonical evidence and active Alpha.3 baselines; it is never weakened for bootstrap.

Baseline filenames are immutable. A changed evidence set uses `r2` or later and must never replace an existing `r1` file.
