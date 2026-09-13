# Public API stability

Scanly SDK v2.1.0 classifies public APIs as Stable, Experimental, or Internal. `ScannerSession`,
`BarcodeTracker`, and `BatchScanSession` are Stable. The DPM profile is
Experimental and opt-in. Recovery implementations, worker internals, and
camera implementation details are Internal. CaptureRouter remains the
authoritative execution boundary. Public declarations and export maps for core,
browser, node, react, parsers, URL Safety, scenario schema, and engine packages are hashed in
`api-snapshots/public-api.json`.

CI rebuilds declarations and fails on an unexpected snapshot change.
Intentional public API changes require semantic-version classification, declaration review, migration
notes, and an explicit snapshot update. Native ESM import and installed-tarball
checks remain separate gates. The C ABI snapshot additionally checks exported
symbols, enum values, and normalized struct layouts.

Internal attempt plans, coordinate matrices, benchmark fixture results, and
camera `InternalTrack` state are not promoted to application contracts.
Registries remain extension APIs with explicit register/replace/dispose lifecycle
rules. Breaking changes after v2.0.0 require a new major release and qualification cycle. v2.1.0 adds the backward-compatible, optional `@scanly/url-safety` package and its Node-only `/server` entry; existing scanner APIs remain compatible. URL Safety has its own analysis status and never adds AI latency or failure to the barcode decoding state machine. See [Link Intelligence](../url-safety.md).
