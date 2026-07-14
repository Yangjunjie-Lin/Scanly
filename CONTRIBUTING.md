# Contributing

Thank you for helping maintain Scanly's focused QR-scanning scope.

## Setup

Use Node.js 20–24 and npm 10+:

```bash
npm ci
npm run fixtures:generate
npm run dev
```

Before a pull request, run:

```bash
npm run check
npm run test:e2e
npm run benchmark:smoke
```

Run `npm run benchmark` when decoding, fixtures, loader, or benchmark contracts change.

## Benchmark integrity

Never remove hard fixtures, weaken damage, change an expected payload/outcome, mark a real failure as expected, or lower a gate to manufacture improvement. Add fixtures only when they have a clear regression purpose and distribution rights. Generated cases need a fixed seed/transform; project photos need explicit ownership. Keep sensitive QR images out of public issues and commits.

## Code and UI

- Keep decoding modules testable over `PixelBuffer` and preserve non-empty success, cancellation, and stale-owner contracts.
- Keep the existing visual language and dependency footprint; do not introduce a new UI framework.
- Render payloads as text only and keep Open Link restricted to parsed HTTP/HTTPS URLs.
- Add focused tests for bug fixes. Do not silently skip required fixtures.
- Avoid unrelated product expansion; see `docs/maintenance.md`.

## Pull request checklist

- Scope and user-visible behavior are described.
- Tests cover success, failure, cancellation/ownership, or security contracts as applicable.
- Lint, typecheck, coverage, build, E2E, and required benchmark pass.
- Fixture source/license metadata is complete.
- README/docs/changelog are updated when behavior or maintenance policy changes.
- No `.env`, `.vercel`, temporary fixture, secret, or generated smoke artifact is committed.
