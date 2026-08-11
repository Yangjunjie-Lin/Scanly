# Beta 3 industrial difficult-barcode recovery

Scanly SDK v2 Beta 3 adds a diagnosis-driven, bounded recovery layer below the existing `ScannerSession`, `BarcodeTracker`, and `BatchScanSession`. It does not replace those runtimes and does not make an industrial-certification claim.

## Pipeline and trust boundary

The recovery sequence is:

```text
normalized frame
  -> heuristic difficulty diagnosis
  -> candidate-region hints
  -> normal decode
  -> bounded specialized routes after a miss
  -> geometry mapping to the original frame
  -> validated decode candidates
  -> conflict resolution and evidence
  -> scanner / tracker / batch runtime
```

`BarcodeDifficultyDiagnosis` is routing evidence, not Ground Truth. A diagnosis can be wrong, and a recommended route is not proof that a barcode is present. The candidate detector is also advisory: normal full-frame decoding remains the first path, and scanner/tracking code retains periodic full-frame recovery so a detector miss cannot permanently hide a barcode.

Recovery may transform observable pixels, but it must never invent barcode payload information. Neural super-resolution, generative image completion, inpainting, and payload guessing are absent from the decode pipeline. A saturated glare region or destroyed module area that leaves insufficient evidence returns no confirmed result.

## Profiles and budgets

`fast`, `balanced`, `robust`, and `industrial` are cost choices, not accuracy guarantees. Camera budgets are deliberately smaller than static-image budgets. `industrial` is the highest bounded cost and is never selected implicitly by the default camera experience. `dpm-experimental` is an explicit opt-in profile.

Every plan caps:

- route count;
- decode attempt count;
- processed pixels;
- elapsed time when a time budget is supplied;
- candidate count, perspective transforms, rectified area, and temporary bytes where applicable.

The planner ranks only diagnosis-supported routes and does not create a transformation × decoder × scale Cartesian product. Each transformed candidate uses a single-scale, zero-rotation recovery probe scenario with bounded engine fallback.

## Recovery routes

The registry contains deterministic modules for local contrast, illumination normalization, diagnosed blur, glare masking, perspective rectification, small-module resize, damaged printing, quiet-zone padding, screen artifacts, mild cylindrical curvature, and experimental DPM.

Low-contrast recovery applies bounded local contrast normalization, a clipped local histogram strategy, and adaptive thresholding. Illumination recovery estimates local background variation before normalization; it is not a global brightness offset. Blur recovery applies bounded unsharp or direction-aware enhancement only after blur evidence recommends it. Glare recovery masks clipped highlights and refuses glare-dominated frames.

Perspective recovery estimates a quadrilateral, applies a bounded homography, and retains the inverse mapping. Curved recovery supports only mild or medium cylindrical surfaces using a deterministic local warp; arbitrary 3D surfaces are outside scope. Small-module recovery uses bounded crop/resize and selective sharpening without neural super-resolution. Damaged recovery uses conservative morphology and leaves recovery authority to the barcode format's decoder and error correction. Quiet-zone recovery adds only a neutral border; it never fills the data region.

Direct Part Mark recovery is experimental. Standard Data Matrix ECC 200 remains supported; DPM Data Matrix on metal or plastic is an opt-in evaluation profile, not DPM certification. Its morphology and directional-contrast work is bounded, and DPM is off by default.

## Candidate agreement and evidence

`DecodeCandidateSet` groups candidates by payload and format and considers decoder validation, checksum/structure evidence, independent route agreement, temporal recurrence, and geometry consistency. Conflicting payloads are not silently resolved. If the evidence is insufficient, the pipeline returns no confirmed result.

`ScanEvidence.evidenceScore` is a bounded evidence aggregate. It is explicitly not a calibrated probability. Applications must not display it as “99% confidence” or use it as a probability threshold.

Successful results record route attribution and an optional development-only `ScannerDiagnostics` snapshot. The inspector explains the diagnosis, routes attempted, route that succeeded, rejected planning entries, attempt/pixel totals, candidate conflicts, and insufficient-evidence reasons. The normal demo does not expose this internal detail in production mode.

## Geometry and tracking

Every crop, resize, perspective transform, curved warp, and padding operation carries forward and inverse coordinate transforms. Candidate corners are mapped back to the original camera frame before a public `ScanResult` is emitted. Recovered results therefore retain canonical original-frame geometry and can enter `BarcodeTracker` and `BatchScanSession` without changing payload identity or physical-instance semantics.

## Worker and main-thread audit

Browser camera recovery executes inside the existing persistent decode Worker. Candidate detection, pixel loops, geometry recovery, specialized transforms, and decode work remain on that Worker path. The main thread owns frame admission, lifecycle, UI events, tracker composition, and rendering. If Worker construction fails, the existing bounded degraded fallback can execute on the main thread; it is a compatibility fallback, not the preferred industrial path.

Node static decoding uses the same core recovery pipeline and route contracts. Browser/Node integration tests assert payload and format parity on identical static pixels. The core industrial soak intentionally records `workerEvidence: not-applicable-core-soak`; actual Worker/WASM lifecycle and native-allocation cleanup remain covered by the scanner and tracking Worker/WASM regression soaks. Evidence reports must preserve those scopes and must not relabel a core fake-decoder soak as Worker evidence.

## Development corpus and reports

`fixtures/beta3/` keeps three evidence layers separate:

- `generated/`: deterministic project-generated derivatives with difficulty and severity labels;
- `curated-open-license/`: fail-closed third-party photographs with source, original URL, license, SHA-256, rights review, and Ground Truth; currently empty;
- `adversarial-negative/`: at least 100 deterministic industrial-looking non-code surfaces whose only valid confirmed-result count is zero.

Generated and curated data are development/integration evidence. Neither is project-owned physical-device evidence. Physical camera and device work remains an RC-stage gate tracked by [Issue #13](https://github.com/Yangjunjie-Lin/Scanly/issues/13).

Run the development gates with:

```bash
npm run fixtures:verify-industrial
npm run benchmark:industrial -- --full --gate
npm run benchmark:industrial:negative -- --full --gate
npm run test:industrial:soak
```

The report separates clean, moderate, and severe recall; format, difficulty, and severity slices; false positives; format confusion; checksum failures; conflicts; route attribution; ablation; latency; route/attempt count; and processed pixels. It compares normal decode with normal plus recovery. A route with no safe positive marginal contribution must not be treated as a justified default merely because its implementation exists.

Beta 3 reports are development or integration evidence. They do not activate `v2-beta3-r1`, create a tag or GitHub Release, publish npm packages, or make Stable, production, commercial-parity, warehouse, or industrial-certification claims.
