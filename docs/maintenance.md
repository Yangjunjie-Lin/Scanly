# Maintenance policy

Scanly v1 remains a feature-complete browser scanner baseline. SDK v2 is an alpha foundation: future work should prioritize stable contracts, lifecycle safety, external datasets, physical-device evidence, security, optional engines, and verified format expansion rather than unrelated product features.

## Supported toolchain

- Node.js: 20 through 24 (`>=20 <25`); CI uses 20 and the final local audit uses 24
- npm: 10 or newer
- Reproducible install: `npm ci` with the committed `package-lock.json`

## Dependency policy

Dependabot opens small monthly npm and GitHub Actions groups. Merge security patches promptly after `npm run check` and cross-browser smoke tests. Prefer patched versions within the current framework major; major upgrades require an explicit compatibility task, full E2E, full benchmark, and production Worker verification. Never use `npm audit fix --force` to hide a conflict.

## Fixture rules

- Do not delete, weaken, relabel, or change expected payloads to improve the score.
- Keep hard failures such as `14-damaged` in the denominator.
- Generated fixtures must be reproducible from the fixed seed and generator script.
- Project photos must be owned/licensed for repository distribution.
- Public issues must not include QR images containing credentials or personal data.
- New multiple fixtures must declare every required payload and expected result count.

Regenerate deterministic inputs with `npm run fixtures:generate`. Ordinary `npm run benchmark` writes ignored development evidence. Regenerate canonical JSON, CSV, Markdown, and the README benchmark block only with `npm run benchmark:canonical` from a clean committed revision.

## Which benchmark to run

Run `npm run benchmark:smoke` for UI-only, documentation, safe dependency patch, and Worker-client changes that do not alter decoding logic. Run all development profiles for any change to the loader, pixel representation, region/candidate logic, preprocessing, decoder adapters/order, result normalization, fixture manifest/generator, or benchmark contract; reserve canonical mode for intentional release-evidence regeneration.

## Release checklist

1. Confirm a clean intended diff and update `CHANGELOG.md`.
2. Run `npm ci`, `npm run fixtures:generate`, and `npm run scenarios:generate`.
3. Run `npm run check` and all three Playwright project commands.
4. Run smoke/full benchmark gates and the identical-input comparison harness.
5. Run `npm audit` and `npm audit --omit=dev`; resolve high/critical production findings.
6. Confirm canonical benchmark/README synchronization and retain known failures.
7. Verify the Vercel production deployment, Worker chunk, console/network, representative fixtures, cancel/recovery, camera denial, and mobile viewport.
8. Create a SemVer tag and GitHub release only from a committed, green revision.

## Security updates

Treat high/critical production advisories as priority maintenance. Determine whether Scanly uses the affected surface, update to the smallest supported patched release, run the full production build and browser Worker tests, then deploy and document the resolution. Follow `SECURITY.md` for private reports.

## Vercel checks

Keep a single production project and stable alias. Never commit `.vercel/` or tokens. After framework, headers, Worker, or build changes, verify that the production Worker JavaScript returns successfully, no CSP/Permissions-Policy rule blocks it, no localhost request appears, and the latest GitHub main deployment owns the production alias.

## Maintenance scope

Accepted future work:

- security vulnerabilities;
- unsupported dependencies or Next.js/Vercel compatibility;

- browser API changes;
- reproducible, tested QR decoding improvements;
- real user-reported bugs.

Out of scope: accounts, cloud uploads, history, databases, analytics, ads, social features, unrelated utilities, AI/ML branding, and feature work intended only to create contribution activity.

## Required merge checks

Branch protection should require the stable check names `CI`, `Full Benchmark / Fast`, `Full Benchmark / Balanced`, `Full Benchmark / Robust`, `Full Benchmark / Comparison`, `Full Benchmark / Assemble`, `Browser Benchmark / Chromium`, `Browser Benchmark / Firefox`, `Browser Benchmark / WebKit`, `Public API`, and `Vercel`. A skipped, missing, or stale check is not a pass. Full Benchmark uses independent clean checkouts and assembles only source-compatible machine-readable reports; browser pull requests use the smoke suite while manual/scheduled runs may select the full suite.
