# Maintenance policy

Scanly v2.0.1 is the current Stable SDK line. Maintenance prioritizes security, correctness, compatibility, performance, physical qualification, bug fixes, patch releases, and carefully scoped minor releases. New work must preserve the local-only privacy boundary and the public eight-format contract.

## Supported toolchain

- Node.js 20 through 24 (`>=20.16 <25`)
- npm 10 or newer
- Reproducible install with `npm ci` and the committed lockfile
- iOS 13+, Swift tools 5.9, and the package's pinned ZXing-C++ revision
- Android API 24+, Java 17, `arm64-v8a` and `x86_64`

## Branch strategy

- `main` is the latest released Stable line.
- `develop` is the next patch/minor integration line.
- Feature and fix branches start from `develop` and return through pull requests.
- Release qualification is recorded in versioned evidence committed through `develop`; only `main` and `develop` are retained as long-lived branches.
- Immutable tags and evidence preserve released history; never move or rebuild a published tag.

For a normal v2.0.1 bug fix:

```text
develop -> fix branch -> PR to develop
-> versioned qualification evidence -> PR from develop to main
-> signed v2.0.1 tag -> GitHub Release -> npm / Native publication
-> synchronize main back into develop
```

For an urgent hotfix:

```text
main -> hotfix branch -> PR to main -> signed patch release
-> back-merge or fast-forward the released main line into develop
```

## Dependency policy

Dependabot opens small npm and GitHub Actions groups. Merge security patches promptly after relevant checks. Prefer patched versions within the current framework major; major upgrades require an explicit compatibility task, browser/build verification, and package/API checks. Never use `npm audit fix --force` to hide a conflict.

## Fixture and benchmark rules

- Do not delete, weaken, relabel, or change expected payloads to improve a score.
- Keep hard failures in the denominator.
- Generated fixtures must be reproducible from a fixed seed.
- Public issues must not include credentials or personal data in barcode images.
- Run `benchmark:smoke` for changes that cannot affect decoding; run the full relevant profile for decoder, fixture, loader, or benchmark-contract changes.
- Canonical evidence is regenerated only as an intentional, reviewed release-evidence operation.

## Stable release checklist

1. Confirm a clean intended diff, package versions, release metadata, and changelog.
2. Run version, workflow, docs, package metadata, API/ABI, Native, security, and relevant correctness gates.
3. Build and inspect publishable tarballs and Native artifacts from the qualified source.
4. Record artifact hashes, SBOM, licenses, provenance, and reproducibility evidence.
5. Merge through a protected pull request to `main`.
6. Create a signed SemVer tag without moving earlier tags.
7. Create a non-draft, non-prerelease GitHub Release and publish the required channels.
8. Verify npm dist-tags/provenance, Native assets, production deployment, and the post-publication record.
9. Synchronize `main` into `develop` so future work contains the released line.

## Physical qualification

Automated browser, simulator, and emulator coverage is not physical-device qualification. The v2.0.0 physical validation program remains `POST_RELEASE_VALIDATION_PENDING` under Issue #13; v2.0.1 does not claim physical PASS or reinterpret those zero evidence counts.

When that program completes, do not modify v2.0.0 binaries or the qualification/publication records. Add `release/stable/v2.0.0-physical-qualification-record.json` containing the released artifact hashes, real device matrix, 30/60-minute soak evidence, and false-positive gate. The release evidence chain is Qualification → Publication → Physical Qualification.

## Required repository settings

Protection and merge settings are documented in [GitHub repository settings](maintenance/github-repository-settings.md). Required checks must use current workflow check names and must not force nightly/manual-only long benchmarks onto every ordinary pull request.

## Maintenance scope

Accepted work includes security vulnerabilities, correctness defects, browser/platform API changes, package/runtime compatibility, physical qualification, performance regressions, and reproducible barcode-decoding improvements.

Out of scope are accounts, cloud image uploads, server-side history, analytics, ads, social features, unrelated utilities, and certification claims without independent evidence.
