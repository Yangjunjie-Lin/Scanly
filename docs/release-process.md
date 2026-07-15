# Release process

1. Freeze fixture/scenario schemas and run generators.
2. Run quality gates, lint, typecheck, unit/integration coverage, package builds, production web build, all Playwright projects, benchmark smoke/full gate, and comparison harness.
3. Review API surface, package exports, dependency audit, generated reports, security/compatibility gaps, and changelog.
4. Version all SDK workspaces consistently under semantic versioning; keep `alpha`/`preview` until migration and acceptance evidence is complete.
5. Build package tarballs locally and inspect contents before any publish authorization.
6. Tag/release only after human approval. This repository task does not publish npm packages.

Stable v2 requires a documented deprecation policy, device evidence, stronger external/real datasets, resolved high-risk dependency issues, and explicit API review. A green internal benchmark alone is insufficient.
