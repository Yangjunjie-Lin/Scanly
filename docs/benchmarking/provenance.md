# Benchmark provenance and baselines

Canonical benchmark and baseline-freeze commands require unstaged diff, staged diff, and porcelain status to be clean. A dirty development run must opt in with `--allow-dirty-development`; its report records `repositoryDirty: true` and is not eligible for baseline freeze.

Every report records commit SHA, commit tree SHA, package-lock hash, selected scenario hash, manifest plus fixture-byte hash, ordered engine composition hash, and runner-source hash. Fixture paths and bytes are both included in the dataset hash.

Active baselines are resolved through `benchmark-results/baselines/registry.json`. Ordinary runs never change the registry. Freeze requires:

```text
npm run benchmark:freeze -- --profile=balanced --baseline-id=v2-alpha3-r1
```

The command requires explicit approval, a clean tree, complete provenance, zero timeout/engine failures, and exclusive file creation. Activating a new file remains an explicit reviewed registry change. Alpha.1 and Alpha.2 files are immutable history.

Alpha.3 baselines cannot be truthfully frozen until the implementation is committed and CI-equivalent checks have completed on that commit.
