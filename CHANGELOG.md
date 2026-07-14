# Changelog

All notable changes follow semantic versioning.

## [1.3.0] - 2026-07-14

### Added

- Cross-browser Chromium/Firefox/WebKit upload smoke projects and automated accessibility checks.
- Real Worker-path instrumentation/tests, repeated cancellation recovery, upload size/pixel limits, security headers, maintenance policy, security/contribution guidance, issue templates, and monthly Dependabot configuration.
- Benchmark success-rate and performance regression gates in addition to the historical absolute baseline.

### Changed

- Upload success now has a compile-time and runtime non-empty result contract with a defined primary result.
- Next.js updated within 14.x to the supported security patch line.
- CI uploads dedicated smoke artifacts and fails if they are missing.
- Package engine support is explicit: Node.js 20–24 and npm 10+.

### Security

- Open Link accepts only parsed HTTP/HTTPS URLs; payloads remain plain text.
- Added nosniff, referrer, permissions, and frame-denial response headers.

### Known limitation

- The retained `14-damaged` fixture remains undecodable; the internal suite is 51/52 (98.1%), not 52/52.

## [1.2.0]

- Worker-based upload pipeline, real cancellation, stale-job ownership, multi-QR completeness, benchmark telemetry, and CI quality gates.
