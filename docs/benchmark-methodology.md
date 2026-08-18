# Benchmark methodology

The canonical benchmark routes normalized frames through `CaptureRouter`. Fixture evaluation is outcome-specific:

- `decode` passes only when required payloads are present and the unexpected-payload policy is satisfied.
- `no-symbol` passes only for a payload-free `no_symbol_found` outcome.
- `invalid-input` passes only for an explicitly allowed malformed-input code.

Timeouts, cancellation, engine initialization/execution failures, Worker failures, source errors, and exceptions never pass as ordinary negative images. Empty expected payload strings are not required payloads.

Reports include Router graph phases, preprocessing and rotation, a dynamic per-engine timing map, total Router latency, and time to first result. Cancellation gates cover pre-abort, active work, and Router disposal. Dataset compatibility hashes the manifest, fixture paths, and fixture bytes. Immutable profile baselines are created with exclusive file creation and are never overwritten.

The deterministic high-entropy guard is an internal adversarial bound, not a universal image-quality classifier. Its retained-corpus threshold is checked against every positive fixture before release.
