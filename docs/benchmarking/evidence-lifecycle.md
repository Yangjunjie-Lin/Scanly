# Canonical evidence lifecycle

Scanly keeps development output, CI artifacts, canonical candidates, committed canonical aliases, baseline candidates, and active baselines as distinct evidence classes. Development and CI output is ignored; tracked aliases change only through `benchmark:update-canonical` with explicit approval.

The reproducible flow is:

1. Check out a clean source commit, run deterministic fixture/scenario generation, and require no diff.
2. Run Fast, Balanced, Robust, Comparison, and Symbologies independently with Node 24 on Windows x64. Profile and Comparison candidates use one warmup and three measured iterations; Symbologies records the complete per-format gate result.
3. Assemble the eight external artifacts (Fast/Balanced/Robust JSON and CSV, Comparison JSON, and Symbologies JSON) with `benchmark:assemble-canonical`. Assembly requires each CSV to be an exact row-for-row representation of its JSON report, validates schemas, source identity, correctness, controlled memory, iteration policy, symbology gates, and every SHA-256 hash, then emits an immutable schema 2.1 manifest.
4. From the same clean source checkout, run `benchmark:update-canonical -- --manifest=<path> --approve-canonical-update`. It stages and installs all JSON and CSV aliases, the manifest, README summary, and benchmark documentation as one rollback-capable operation.
5. Freeze each profile from that manifest with `benchmark:freeze -- --profile=<profile> --baseline-id=v2-alphaN-rN --canonical-manifest=<path> --approve-baseline`. Freeze uses exclusive file creation and never reads tracked aliases.
6. Activate all three profiles together with `benchmark:activate -- --baseline-id=v2-alphaN-rN --canonical-manifest=<path> --approve-activation`. Activation verifies one evidence set and atomically replaces the registry. The canonical update, three immutable candidates, and registry are reviewed and committed as one evidence-only change.

## Source and evidence commits

`sourceCommitSha` and `sourceTreeSha` identify the exact code, fixtures, scenarios, lockfile, and benchmark runner used to create the artifacts. A later `evidenceCommitSha` may contain those reports. Between the two commits only approved canonical aliases and manifests under `benchmark-results/`, immutable versioned baselines, the registry, `docs/benchmark.md`, `docs/symbologies.md`, and the marked README benchmark block may change. Runtime, fixture, scenario, lockfile, workflow, test, or benchmark-tooling changes require a new source run. `benchmark:verify-evidence` enforces this ancestry and path policy.

## Gate modes

`--gate-mode=baseline-candidate` enforces absolute correctness, memory, timeout, iteration, and completeness contracts without comparing against an older dataset. `--gate-mode=active-baseline` performs normal regression checks against the active runtime-family baseline.

`quality:evidence:bootstrap -- --canonical-manifest=<path>` explicitly validates an external candidate without requiring an already-active baseline. It is used only by the manual Baseline Candidate workflow or an explicit CLI invocation. Default `quality:evidence` is always release mode. When a tracked canonical manifest exists, CI must run strict release verification and must not fall back to bootstrap after a failure.

## Canonical CSV policy

Canonical evidence includes `latest-fast.json`/`.csv`, `latest.json`/`.csv`, `latest-robust.json`/`.csv`, `comparison.json`, and `symbologies.json`. The manifest hashes all eight files after normalizing text line endings to LF, so Git checkout settings cannot invalidate otherwise identical Windows evidence. Assembly rejects CSV row-count, fixture-ID, represented-field, or symbology-report drift; canonical update installs every alias atomically; and release verification rejects any stale JSON, CSV, or Symbologies alias.

Baseline filenames are immutable. A changed evidence set uses `r2` or later and must never replace an existing `r1` file.
