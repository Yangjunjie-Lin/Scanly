# Decoding Pipeline

Upload-mode decoding follows an ordered, budgeted fallback path. It is heuristic image processing — not a machine-learning model.

## Stages

1. **Load** — decode image bytes to RGBA (`createImageBitmap` in browser; Sharp with EXIF rotation in Node).
2. **Candidate regions** — edge-density grid on a ~400px preview; top-N regions with NMS.
3. **Crops** — tight / medium / expanded padding with edge clamping.
4. **Scales** — original, downscaled, upscaled (pixel and time budgets enforced).
5. **Preprocess** — ordered variants: original → contrast → invert → Otsu → fixed thresholds → gamma → sharpen.
6. **Rotation** — 0° first; 90/180/270 after basic failures (limited on full-image fallback).
7. **jsQR** — one `attemptBoth` inversion probe per preprocessing variant; equivalent inverted probes are not repeated.
8. **Alternative candidates** — continue top-N if the first crop fails or when collecting multiple codes.
9. **Full-image fallback** — 800 / 600 / 1200 max-side passes.
10. **ZXing** — final adapter on promising crops.

## Attempt metadata

Each attempt stores candidate index/score, padding, scale, rotation, preprocess method, decoder, elapsed ms, and success/payload.

## Budgets

- `maxCandidates`, `maxAttempts`, `timeoutMs`, `maxPixels`
- Browser upload boundary: 25 MiB, 24 megapixels, and 12,000 pixels on either side before canvas RGBA allocation
- AbortSignal cancellation for direct pipeline callers; browser Upload cancellation terminates the Worker for bounded latency
- decoder selection for tests (`decoders.jsqr`, `decoders.zxing`, or `decoderOrder`)

## Multiple QR codes

When `findMultiple` is enabled, unique payloads are collected across candidates (capped). Production uses a no-new-result stall window because it cannot know the true count. Benchmark multiple fixtures declare `requiredPayloads` and pass only when the complete required set is present; `expectedResultCount` is a benchmark stop hint, not a production assumption.

A stall is never success when no result has been found. Successful outcomes use a non-empty tuple, always define `primary`, and are protected by a runtime invariant at their single constructor boundary.
