# Decoding pipeline

The shared Router graph orchestrates an ordered, budgeted QR fallback implementation. It is heuristic image processing, not a machine-learning model. Upload, Worker, main-thread, normalized-pixel, Node benchmark, and camera-sampled frames all use this path.

## Logical graph

1. Frame normalization converts supported packed formats to RGBA without copying already-packed RGBA.
2. ROI applies full-frame or bounded relative cropping.
3. Localization creates an edge-density or full-frame plan.
4. Candidate generation uses preview scoring, top-N regions, padding, scales, and bounded fallbacks.
5. Candidate deduplication removes geometrically equivalent work.
6. Enhancement planning orders original, contrast, invert, Otsu, thresholds, gamma, and sharpen as configured.
7. Geometry planning applies the configured 0/90/180/270 rotations.
8. Decoder execution calls registered engine plugins in real sequential or parallel mode.
9. Result aggregation deduplicates and deterministically orders non-empty results.
10. Validation executes registered validators and bounds messages.
11. Semantic parsing attaches only scenario-enabled side-effect-free structured payloads.

The logical split reuses optimized internal pixel primitives and a per-frame artifact store; it does not force a copy at every operator boundary.

## Budgets and output

Scenarios bound pixels, candidates, attempts, execution time, concurrent frames, retained artifact allocations/bytes, and result count. The browser upload boundary additionally caps encoded bytes, decoded dimensions, and megapixels before canvas RGBA allocation. Cancellation propagates through the graph and engine calls; Worker cancellation terminates the Worker.

Attempt metadata contains candidate index, padding, scale, rotation, preprocessing, engine, elapsed time, and success. It is exposed only when `output.includeAttempts` is enabled and never contains payload bytes or text.

## Multiple QR codes

When multi-code is enabled, unique payloads are collected across candidates up to the scenario cap. Production uses a no-new-result stall window because it cannot know the true count. Benchmark multiple fixtures declare required payload sets and pass only when the complete set is present. A stall is never success when no result was found. Successful public outcomes use a non-empty tuple and always define `primary`.
