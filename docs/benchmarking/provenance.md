# Benchmark provenance and baselines

Canonical benchmark, CI-artifact, and baseline-freeze commands require unstaged diff, staged diff, and porcelain status to be clean. An ordinary `npm run benchmark` is development mode: it may use a dirty tree, writes only to ignored `benchmark-results/development/`, records `canonical: false`, never updates README/docs, and is ineligible for baseline freeze. CI profile jobs write ignored `benchmark-results/ci/` reports from independent fresh checkouts. Only an intentional clean canonical command updates tracked reports.

Every report records commit SHA, commit tree SHA, package-lock hash, selected scenario hash, manifest plus fixture-byte hash, ordered engine composition hash, and runner-source hash. Fixture paths and bytes are both included in the dataset hash.

Active baselines are resolved through `benchmark-results/baselines/registry.json`. Ordinary runs never change the registry. Freeze requires:

```text
npm run benchmark:freeze -- --profile=balanced --baseline-id=v2-alpha3-r1
```

The command requires explicit approval, a clean tree, canonical warmup of at least one, at least three measured iterations, complete provenance, zero final controlled bytes, zero false positives/timeouts/engine failures, complete multi-code results, and exclusive file creation. Activation revalidates SDK version, runtime family, fixture count, dataset hash, source cleanliness, execution policy, correctness, and memory. Alpha.1 and Alpha.2 files are immutable historical regression references, not active Alpha.3 evidence.

Alpha.3 baselines cannot be truthfully frozen until the implementation is committed and CI-equivalent checks have completed on that commit.
