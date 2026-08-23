# GitHub repository settings

This is the auditable baseline for the published Stable repository.

## General

- Default branch: `main`
- Automatically delete head branches after merge: enabled
- Preserve signed Stable and RC tags; never force-update or delete them
- Dependabot targets `develop` and owns its active update branches

## `main` protection

- Require a pull request before merging
- Block force pushes and branch deletion
- Require conversation resolution
- Require branches to be up to date before merge
- Require ordinary PR checks: `CI`, `Package Tarball`, `Public API`, and applicable Native/Browser checks exposed by the current workflows
- Do not require scheduled/manual-only full benchmark or extended soak jobs on every documentation or metadata PR

## `develop` protection

- Require pull requests for normal integration work
- Block force pushes and branch deletion
- Require conversation resolution
- Require `CI`, package/API checks, and applicable browser or Native regression checks
- Keep long benchmark and soak workflows conditional on relevant source changes or release qualification

Repository administrators must compare these names with the checks currently reported by Actions before editing the rules. A missing, stale, or skipped required check is not a PASS.
