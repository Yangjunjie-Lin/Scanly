# Changelog

All notable changes follow semantic versioning.

## Unreleased — SDK v2 Beta 4 development

- Entered `2.0.0-beta.4` development on `architecture/sdk-v2-beta4-device-platform-hardening` from Beta 3 merge commit `333c4a9a202c3871d10cb0455354390932e8ee5b` on `develop/sdk-v2`.
- Added a dedicated `/device-lab` physical-camera harness, fixed Ground Truth targets, printable/screen target generation, privacy-aware draft export, and browser/camera diagnostics without promoting drafts to evidence.
- Added fail-closed device evidence schema/verification, per-device benchmark summaries, physical/simulated evidence separation, sensitive-data review fields, and a dedicated Device Evidence Validation workflow.
- Added bounded camera constraint negotiation, typed camera error taxonomy, track-ended recovery, visibility/orientation/resolution generation invalidation, capability diagnostics, and camera lifecycle contract tests.
- Split the Beta 4 gate into `integration` and `release`: integration may proceed with honest physical evidence deferral after every automated contract passes, while release remains fail-closed on real iOS, real Android, physical soak, full matrix, and exact-source evidence.
- Current truthful status is `BETA4_INTEGRATION_GO` / `DEVICE_HARNESS_GO` / `AUTOMATED_VALIDATION_GO` / `PHYSICAL_DEVICE_VALIDATION_DEFERRED_TO_RC` / `FULL_DEVICE_MATRIX_PENDING` / `BETA4_RELEASE_NO_GO`: no iOS Safari, Android Chrome, desktop webcam, remote physical device, or 30-minute physical camera session is committed.
- Physical iOS Safari, Android Chrome, real-camera lifecycle, physical tracking/batch, and long-running camera evidence have intentionally been deferred to the final RC validation campaign. This deferral does not change any evidence count into a PASS.
- No tag, GitHub Release, npm publication, Stable/Latest claim, Native SDK work, or new symbology is authorized.

## Unreleased — SDK v2 Beta 3 development

- Entered `2.0.0-beta.3` development on `architecture/sdk-v2-beta3-industrial-robustness-foundation` from the Beta 2 merge commit on `develop/sdk-v2`.
- Began a diagnosis-driven, budgeted industrial recovery layer for difficult barcode inputs while preserving Alpha.5 symbology, Beta 1 real-time, and Beta 2 tracking/batch regression gates.
- Added public recovery profiles, budgets, route IDs, heuristic difficulty diagnosis, evidence, and optional scanner diagnostics; internal candidate detection and pixel buffers remain implementation details.
- Added bounded contrast, illumination, blur, glare, perspective, mild-curvature, small-module, damaged, quiet-zone, screen, and opt-in DPM routes with original-frame coordinate recovery.
- Added validated decode-candidate conflict resolution, route attribution, a 39-case deterministic difficult corpus, 120 industrial-looking negatives, a 5,000-frame core soak, and Chromium/Firefox/WebKit industrial scenarios.
- Kept neural super-resolution and generative recovery out of the decode pipeline; DPM and curved-surface recovery remain explicitly experimental.
- Beta 3 is development/integration evidence only: no tag, GitHub Release, npm publication, Stable claim, industrial certification, or canonical release freeze is authorized.

## SDK v2 Beta 2 tracking and batch integration

- Entered `2.0.0-beta.2` development on `architecture/sdk-v2-beta2-barcode-tracking-foundation` from the Beta 1 merge commit on `develop/sdk-v2`.
- Preserved the complete Beta 1 real-time runtime and Alpha.5 multi-symbology evidence as mandatory regression gates.
- Began the bounded multi-target barcode tracking, physical-instance identity, occlusion recovery, batch scan, and deterministic tracking-evidence foundation.
- Physical-device certification remains tracked separately in Issue #13 and is not claimed by Beta 2 integration evidence.

## SDK v2 Beta 1 runtime integration

- Entered `2.0.0-beta.1` development on `architecture/sdk-v2-beta1-realtime-scanner-foundation` for the persistent real-time scanner runtime.
- Preserved the Alpha.5 static upload, multi-symbology, Browser/Worker/Node, checksum, format, and evidence integration gates as frozen regression requirements.
- Added `ScannerSession`, latest-frame `FrameScheduler`, low-cost `FrameQualityAnalyzer`, bounded decode escalation, temporal confirmation, ROI reuse, physical-instance repeat suppression, typed camera capabilities, and deterministic `MediaStream`/sequence frame sources.
- Replaced nominal real-time scenario labels with 20 semantic Ground Truth drivers covering escalation, repeat identity, quality recovery, ROI, lifecycle, cancellation, backpressure, temporal geometry, malformed frames, Worker recovery, and disposal. Report schema `2.0-beta1` records independent expected/observed values, traceable assertions, failure reasons, metrics, and event/profile/diagnostic timelines; correctness gates are observation-derived.
- Split reliability evidence into a 10,000-frame fake-decoder Scanner Core Soak with `workerEvidence: "not-applicable"`, a pull-request tier of at least 1,000 actual `BrowserScannerFrameDecoder`/persistent Worker/ZXing-C++ WASM executions, and a scheduled/manual 10,000-frame Worker/WASM tier.
- Added browser real-time smoke, lifecycle, once-per-session repeat, and latest-frame backpressure coverage to the Chromium, Firefox, and WebKit Browser Benchmark matrix.
- Expanded camera capability state tests for unsupported torch/zoom, manual zoom override, auto-zoom cooldown and maximum clamp, anti-oscillation behavior, and source-switch refresh. This is state-logic coverage, not physical auto-zoom validation.
- Replaced the deferred project-owned release-photo requirement with a strict curated open-license camera-photo gate: 16 pinned originals cover Data Matrix/PDF417/Code 128/EAN/UPC at 3/3/4/6, with 21 physical instances, 20/20 exact semantic results, license/camera/sensitive-data review, and zero unexpected or misclassified results. Project-owned count remains 0 and informational only.
- Beta 1 runtime integration can be `GO` only when runtime and curated-photo gates pass. Release remains `NO-GO` while Issue #13 and independent physical-device evidence remain open; no tag, GitHub Release, npm publication, Stable claim, or `v2-beta1-r1` evidence activation is authorized.

## Alpha.5 integration closure

- Consolidated the Alpha.5 multi-symbology foundation into `develop/sdk-v2` as an internal development milestone.
- Added explicit `integration` and strict `release` symbology gate modes. Integration accepts the absent project-owned photo corpus only as `DEFERRED_TO_BETA1`; generated correctness, checksum, false-positive, format, runtime, package, and API gates remain mandatory.
- Alpha.5 is not a tagged or public release: no GitHub Release, npm publication, Stable claim, or active Alpha.5 evidence baseline is authorized. The last fully frozen release evidence remains historical Alpha.4 r4.
- Created the Beta 1 planning boundary for project-owned photographs, physical-camera validation, real-time scanner runtime, and isolated dependency/toolchain migrations.

## [2.0.0-alpha.5] - 2026-07-19

- Added the explicit Alpha.5 public format contract for QR Code Model 2, Data Matrix ECC 200, PDF417, Code 128, EAN-13, EAN-8, UPC-A, and UPC-E.
- Added a deterministic 146-fixture multi-symbology corpus, true ZXing-C++ reader-WASM integration tests, Node Router parity, and Chromium/Firefox/WebKit Worker coverage for every new public format.
- Preserved UPC-A and UPC-E public representations across single-format and all-format native masks, including strict checksum validation and UPC-E round-trip metadata.
- Replaced the contract-only symbology benchmark with measured per-format, confusion, GS1, checksum, mixed-completeness, latency, and WASM-memory reporting.
- Added format-class metadata, normalized format selections, QR-compatible defaults, multi-format scenario presets, and public decoded-barcode/retail metadata contracts.
- Wired requested format masks and native result mappings through the ZXing-C++ WASM boundary. Invalid EAN/UPC checksums are rejected and UPC-A/UPC-E format identity is preserved.
- Extended local GS1 parsing to bounded FNC1 element strings while keeping semantic parsing separate from raw decoding.
- Enforced Alpha.5 symbology release gates via `--gate` / `--canonical-candidate`, Canonical Manifest schema 2.1 with a dedicated symbology report, and version-independent baseline freeze/activation.
- Alpha.5 remains a preview. Project-owned real-photo expansion and canonical Alpha.5 evidence activation are still release gates and are not represented by the historical Alpha.4 reports.

## [2.0.0-alpha.4] - 2026-07-18

- Added the optional `@scanly/engine-zxing-cpp-wasm` QR engine using pinned `zxing-wasm` 3.1.1 and ZXing-C++ commit `6c2961d2a9ea4bc4e4ae8f37b1497299f04dd861`.
- Added local package-relative Browser/Worker/Node asset loading, SHA-256 verification, lazy/explicit initialization, concurrent-init deduplication, bounded retry/circuit breaking, typed failures, and explicit disposal.
- Integrated jsQR → ZXing-C++ WASM → ZXing-JS ordering without adding concrete engine dependencies to core. Balanced/Robust now try a high-value native full-frame pass after a limited jsQR probe.
- Added standard/SIMD capability selection. The shipped asset is standard WASM only; SIMD remains unavailable and is not presented as a measured acceleration.
- Added raw bytes, geometry, orientation, selected variant, initialization timing, and WASM linear-memory observations to engine/result and benchmark evidence.
- Expanded comparison provenance with the WASM, adapter, and loader hashes and added raw/single-engine/sequential/experimental-parallel WASM strategies.
- Added loader, native decode, cancellation, repeated-use, package-asset, and integrity tests. Alpha.4 remains a QR Code Model 2 preview, not Stable or broad symbology support.

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
