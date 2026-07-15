# SDK v2 architecture

Scanly is now an npm-workspace repository. Framework-independent code lives in packages; the Next.js application is a reference consumer, not the owner of decoding behavior. All current image processing remains local to the caller.

## Data flow

```text
NormalizedFrame / browser File / camera stream
  → BrowserCaptureSession or CaptureSession
  → CaptureRouter
  → validated ScenarioDefinition 2.0
  → bounded frame artifact store
  → QR pipeline operator
      → localization and candidate deduplication
      → crop padding / scaling / split and full-frame fallbacks
      → cached preprocessing and rotations
      → jsQR and ZXing JavaScript adapters
  → payload normalization and duplicate aggregation
  → validation registry boundary and semantic parsers
  → non-empty ScanSuccess or typed ScanFailure
```

For uploaded browser files, `@scanly/browser` loads and validates image dimensions, transfers the owned RGBA `ArrayBuffer` to a module Worker, and runs the same `@scanly/core` QR pipeline used by Node integration tests and benchmarks. Camera capture is owned by `BrowserCameraSource`; decoded camera text is normalized into the same public result model, while full camera-frame routing remains a documented follow-up.

## Package dependency direction

```text
scenario-schema   parsers   benchmark
       \            /          |
            core              runners
          /   |   \
  browser  engines  node tools
      |
    react
      |
  apps/web-demo
```

`@scanly/core` has no React or Next.js dependency. Engine packages depend on the core engine contract. The browser runtime depends on core and owns Web APIs. React is an adapter over browser lifecycle only.

## Contracts

- `NormalizedFrame` identifies a frame, timestamp, dimensions, stride, format, orientation, source, device metadata, ownership, and disposal callback. Tightly packed RGBA can be borrowed without a full-frame copy; RGB/gray require one bounded normalization copy. YUV is represented but returns `unsupported_format` until a converter is registered.
- `CaptureRouter` validates the frame and scenario, installs deadline/cancellation propagation, scopes a bounded artifact store to one frame, executes the QR operator, parses payloads, and enforces non-empty success.
- `CaptureSession` has deterministic `idle → initialized → running → stopped/disposed` behavior. The default concurrent policy replaces and cancels the previous owner; `reject` returns `concurrent_call_rejected`.
- `Operator` descriptors declare accepted/produced types, configuration schema, cost hints, cancellation behavior, deterministic/stateful behavior, and thread-safety. `executeTaskGraph` supports sequential or dependency-ready parallel branches.
- `DecoderEngine` exposes format capabilities, multi-code behavior, raw-byte/corner availability, version, initialization, typed failures, and disposal.
- `ScanResult` preserves raw text and optional decoder-provided raw bytes, with optional corners/orientation/quality, engine and preprocessing metadata, frame/track identity, structured payload, validation, warnings, and timings. Text-only sources omit raw bytes instead of synthesizing them.

## Shared intermediate results and bounds

Two caches are scoped to one frame and are always disposed:

1. `BoundedFrameArtifactStore` shares normalized frame/inter-operator artifacts and rejects retained-entry or byte-budget overflow.
2. The QR attempt cache reuses identical candidate/preprocess/rotation buffers across decoder attempts. It retains at most the scenario's `maxIntermediateAllocations` and `maxIntermediateBytes`; overflow values are used transiently rather than added to a global cache.

Candidate count, attempts, input pixels, retained intermediate bytes, results, execution time, concurrent frames, and Worker lifetime are explicit scenario or boundary budgets. There is no unbounded global image cache.

## Worker ownership

Every request has a unique job ID. The client accepts only validated messages matching both the pending job and current owner. Cancellation settles the promise, terminates the Worker, and lazily recreates it. Malformed messages fail the active job and restart the Worker. Repeated cancellation/recreation and stale-result rejection are tested.

The published Worker URL is resolved with `new URL("./decode-worker.js", import.meta.url)` so ESM bundlers can emit a self-hosted asset. See [Worker deployment](sdk/worker-deployment.md) for CSP and hosting guidance.

## Camera convergence status

Implemented browser camera ownership includes device listing/switching, track cleanup, visibility stop, orientation notification, duplicate windows, and torch/zoom capability APIs. The current live decoder remains ZXing Browser's frame loop and then maps into the SDK result model. Normalized camera-frame ingestion and temporal tracking interfaces exist at the frame/result boundary, but adaptive cadence and full Router processing of live frames are not yet verified on physical devices.

## Extension path

New engines implement `DecoderEngine`; new graph stages implement `Operator`; new capture behavior is expressed in scenario schema/configuration; new industry claims require datasets, validators, benchmark manifests, and compatibility evidence. Native/WASM bindings are not present in this branch and are not claimed.
