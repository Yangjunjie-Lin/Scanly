# Contributing

Thank you for helping maintain Scanly's focused, local-first barcode scanning SDK scope. The public v2.0.1 format set is QR Code, Data Matrix, PDF417, Code 128, EAN-13, EAN-8, UPC-A, and UPC-E.

## Setup

Use Node.js 20–24 and npm 10+:

```bash
npm ci
npm run fixtures:generate
npm run dev
```

Before a pull request, run the checks relevant to the change:

```bash
npm run quality:static
npm run docs:check
npm run lint
npm run typecheck
npm run test:unit
```

Run package smoke/tarball checks for package or metadata changes. Run browser, Native, and benchmark gates when their runtime contracts change; documentation-only work does not require regenerating long benchmark evidence.

## Benchmark and evidence integrity

Never remove hard fixtures, weaken damage, change an expected payload/outcome, mark a real failure as expected, or lower a gate to manufacture improvement. Generated cases need a fixed seed and transform; project photographs need explicit ownership. Keep sensitive barcode images out of public issues and commits.

Physical-device evidence must come from real, identified hardware and the repository evidence protocol. Simulators, emulators, user-agent spoofing, desktop automation, or Internet photographs must never be promoted to a physical PASS.

## Code and UI

- Keep decoding modules testable over `PixelBuffer` and preserve non-empty success, cancellation, ownership, and stale-generation contracts.
- Keep the existing visual language and dependency footprint; do not introduce an unrelated UI framework.
- Render payloads as text and keep Open Link restricted to parsed HTTP/HTTPS URLs.
- Add focused tests for bug fixes. Do not silently skip required fixtures.
- Avoid unrelated product expansion; see the [maintenance policy](docs/maintenance.md).

## Pull request checklist

- Scope and user-visible behavior are described.
- Tests cover success, failure, cancellation/ownership, or security contracts as applicable.
- Relevant lint, typecheck, coverage, build, browser, Native, and benchmark gates pass.
- Public package README and user documentation are updated when behavior changes.
- API snapshots are reviewed and updated only when a public API change is intentional.
- Package changes include release metadata and pass metadata, tarball, and installed-import verification.
- Fixture source/license metadata is complete.
- Physical evidence is included only when admissible real-hardware evidence exists.
- No `.env`, `.vercel`, temporary fixture, secret, or generated smoke artifact is committed.
