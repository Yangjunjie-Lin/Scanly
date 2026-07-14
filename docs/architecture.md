# Architecture

Scanly is a Next.js App Router client application. It has no image-processing backend: browser images remain on the device, while Node is used only for local/CI tests, fixture generation, and benchmarks.

## Upload data flow

```text
UI thread (QRTool)
  → browser image loader + resource checks
  → transferable PixelBuffer (RGBA ArrayBuffer)
  → Worker client (jobId owner)
  → decode Worker
  → candidate generation + deduplication
  → preprocess / scale / rotate attempt plan
  → jsQR / ZXing adapters
  → normalized non-empty result or typed failure
  → Worker message with jobId
  → active-owner check (stale IDs ignored)
  → UI state
```

Key modules:

```text
components/QRTool.tsx
lib/qr/image-loader.ts
lib/qr/decode-upload.ts
lib/qr/worker/
  worker-client.ts
  worker-messages.ts
  transferable-buffer.ts
  decode-worker.ts
lib/qr/decode-pipeline.ts
lib/qr/candidate-generation.ts
lib/qr/candidate-dedupe.ts
lib/qr/preprocess.ts
lib/qr/jsqr-decoder.ts
lib/qr/zxing-decoder.ts
lib/qr/result-normalizer.ts
```

## Why a Worker

Image preprocessing and repeated decoder attempts can be CPU intensive. Upload decoding runs in a module Worker so React controls remain responsive. The loader transfers an owned `ArrayBuffer`; it is not cloned into a second full-size pixel allocation. Tests verify the production Worker route and transferable contract.

Cancellation terminates the Worker rather than waiting for a synchronous decoder call to yield. The active promise settles as `cancelled`, and the next upload lazily creates a fresh Worker. Unmount, replacement upload, and Worker errors also terminate or restart the Worker.

## Job ownership

Each request receives a monotonically unique `jobId`. The client accepts stage, progress, result, and error messages only when the ID matches both the current owner and pending promise. UI sequence ownership adds a second boundary: an older file load or result cannot change the status of a newer upload.

Every successful core outcome has a non-empty tuple of results and a defined primary result. The stopping heuristic cannot produce success before a decoder has found a payload, and the success constructor enforces this invariant.

## Camera versus upload

- **Upload:** browser file loader → transferable buffer → dedicated Worker → shared pipeline.
- **Camera:** `@zxing/browser` owns the live stream and frame loop on the UI side. Switching away, stopping, or unmounting stops its media tracks.

Camera automation stays Chromium-only because fake media-device behavior differs across browser engines. Upload and Worker smoke tests run in Chromium, Firefox, and WebKit.

## Benchmark reuse

Vitest integration tests and `scripts/run-benchmark.ts` call `decodePixelBuffer()` directly in Node. This removes Worker scheduling and browser hardware from the algorithm regression signal while preserving the exact candidate, preprocessing, decoder, result, and attempt logic used by Upload mode. Browser E2E separately verifies the Worker boundary.

## Production boundaries

- No account, database, upload API, history, analytics, remote logging, or paid QR service.
- Uploads are limited to 25 MiB, 24 MP, and 12,000 pixels per side before canvas allocation.
- Pipeline pixel, attempt, result, and time budgets cap decoding work.
- Payloads render only as text; link actions require a parsed HTTP or HTTPS URL.
- Headers set nosniff, strict referrer policy, camera-only permissions, and framing denial.
- A strict CSP is intentionally not shipped yet: a CSP must be verified against Next.js runtime chunks and module Workers on production Safari before adoption. An incorrect policy would break the scanner.
