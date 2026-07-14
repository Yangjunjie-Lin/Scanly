# Decoding Pipeline

Upload-mode decoding follows an ordered, budgeted fallback path. It is heuristic image processing — not a machine-learning model.

## Stages

1. **Load** — decode image bytes to RGBA (`createImageBitmap` in browser; Sharp with EXIF rotation in Node).
2. **Candidate regions** — edge-density grid on a ~400px preview; top-N regions with NMS.
3. **Crops** — tight / medium / expanded padding with edge clamping.
4. **Scales** — original, downscaled, upscaled (pixel and time budgets enforced).
5. **Preprocess** — ordered variants: original → contrast → invert → Otsu → fixed thresholds → gamma → sharpen.
6. **Rotation** — 0° first; 90/180/270 after basic failures (limited on full-image fallback).
7. **jsQR** — `attemptBoth` inversion; extra `onlyInvert` / `dontInvert` probes for invert cases.
8. **Alternative candidates** — continue top-N if the first crop fails or when collecting multiple codes.
9. **Full-image fallback** — 800 / 600 / 1200 max-side passes.
10. **ZXing** — final adapter on promising crops.

## Attempt metadata

Each attempt stores candidate index/score, padding, scale, rotation, preprocess method, decoder, elapsed ms, and success/payload.

## Budgets

- `maxCandidates`, `maxAttempts`, `timeoutMs`, `maxPixels`
- AbortSignal cancellation (Upload Cancel / new file selection)

## Multiple QR codes

When `findMultiple` is enabled, unique payloads are collected across candidates (capped). Benchmark fixtures in the `multiple` category pass when the contracted primary payload appears among results.
