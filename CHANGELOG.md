# Changelog

All notable changes follow semantic versioning.

## [2.0.0-alpha.3] - 2026-07-16

- Separated development, canonical, baseline-freeze, and CI-artifact benchmark output; added true repeated-run variance and per-iteration stability evidence.
- Added explicit required-engine configuration, a shared global parallel attempt budget, caller-preserving camera escalation, generation-aware Worker recovery, and zero-final-byte memory finalization.
- Expanded public API snapshots to every publishable workspace and separated installed package footprint from esbuild bundle-cost evidence.
- Added reproducible source identity, clean-tree enforcement, and a validated active-baseline registry.
- Added comparison schema 2.0 with raw, single-engine, sequential, and parallel ablations.
- Normalized frame orientation into canonical upright pixels before ROI and candidate processing.
- Added real 5/8/12-code, repeated-payload, high-version, high-frequency-positive, and ZXing-contribution fixtures.
- Added bounded engine diagnostics, explicit parallel failure policy, and controlled peak-memory observations.
- Routed sampled camera frames through a persistent transferable-buffer Worker with fallback and bounded escalation.
- Added browser benchmark, device-result schema, public declaration snapshots, and separate CI workflows.
- Stable remains unsupported: QR Code Model 2 only, no calibrated confidence, native bindings, certified device lab, or industrial certification.

## [2.0.0-alpha.2] - 2026-07-16

- Bounded adversarial candidate generation and cooperative monotonic execution deadlines.
- Explicit benchmark outcomes for decode, no-symbol, and invalid-input fixtures with real phase timing.
- Original normalized-frame corner mapping and engine-derived-only orientation semantics.
- Configured multi-code limits above three and spatial identity for repeated payloads.
- Typed engine failures, active Router/engine disposal waits, and shared frame-memory leases.
- Fast bounded camera sampling, scenario schema 2.1 migration, and explicit monorepo Vercel output configuration.

## [2.0.0-alpha.1] - 2026-07-15

### Added

- npm workspaces for core, browser, React, parser, scenario-schema, benchmark, and jsQR/ZXing JavaScript engine packages.
- Normalized frame, typed error/result, engine, operator, task-graph, bounded artifact, Capture Router, and deterministic session contracts.
- Versioned scenario schema 2.0 with fast, balanced, robust profiles and ablation/resource controls.
- Semantic parsing separated from raw decoding; browser camera source lifecycle and capability detection.
- Negative/adversarial fixtures, false-positive/recall metrics, time-to-first-result, report schema/runtime labels, comparison harness, and soak tests.
- SDK, migration, benchmarking, compatibility, security, extension, and release documentation.
- Real engine/operator/validator registries, a bounded scenario compiler/cache, an eleven-operator execution graph, and deterministic frame leases.
- `@scanly/node` for Sharp-isolated image loading and Node engine composition.
- Profile-specific immutable benchmark baselines and eleven deterministic negative/adversarial fixtures.

### Changed

- Moved QR primitives behind a generic engine executor in `@scanly/core`; concrete decoder libraries now live in engine packages, while Worker/file/camera ownership lives in `@scanly/browser`.
- Browser upload, Worker, main-thread fallback, Node benchmark, and sampled camera frames now execute through `CaptureRouter` and the compiled scenario graph.
- Package and production builds now verify publishable ESM/declaration output and emitted Worker resolution.
- Worker requests/responses and direct pipeline configuration/pixel buffers receive runtime validation.
- Upgraded the reference app to Next.js 15.5.20 and overrode its compatible PostCSS 8.x dependency to 8.5.19; both full and production-only npm audits report zero known vulnerabilities.
- Emitted workspace modules now use Node-compatible ESM relative specifiers, with a native import smoke gate covering all ten public package entry points.
- Results expose decoder-provided raw bytes instead of reconstructed text bytes; upload and camera now share the same result mapping.
- Balanced and robust multi-code execution preserve the 51/52 positive baseline by reserving deep-preprocessing budget and prioritizing the full-frame fallback, while retaining 3/3 multi-code completeness.

### Compatibility

- QR Code Model 2 remains the only implemented/tested symbology. Native/WASM/mobile/.NET/Python bindings are not implemented.
- This is an alpha preview, not an industrial- or production-readiness claim.

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
