# Architecture

Scanly is a Next.js App Router client application. All QR decoding runs in the browser (or Node for benchmarks/tests). No image bytes are sent to a backend.

## Layers

```text
app/page.tsx
  └── components/QRTool.tsx          UI, camera lifecycle, upload abort
        └── lib/qr/decode-upload.ts  File → PixelBuffer → pipeline
              └── lib/qr/decode-pipeline.ts
                    ├── region-detection / candidate-generation
                    ├── preprocess / rotate
                    ├── jsqr-decoder
                    └── zxing-decoder
```

## Module layout

```text
lib/qr/
├── types.ts
├── image-loader.ts          Browser blob → PixelBuffer
├── image-loader-node.ts     Sharp + EXIF orientation (benchmarks/tests)
├── grayscale.ts
├── preprocess.ts
├── region-detection.ts
├── candidate-generation.ts
├── rotate.ts
├── jsqr-decoder.ts
├── zxing-decoder.ts
├── decode-pipeline.ts
├── decode-upload.ts
├── candidate-dedupe.ts
├── worker/
│   ├── worker-client.ts     job ownership, stale-message filtering, restart
│   ├── decode-worker.ts     upload-only pipeline execution
│   ├── worker-messages.ts   typed decode/stage/progress/result messages
│   └── transferable-buffer.ts
├── result-normalizer.ts
└── benchmark-types.ts
```

## Design rules

- Image algorithms are pure functions over `PixelBuffer`.
- UI owns AbortController, camera tracks, and presentation state.
- Decoder adapters return normalized payloads; the pipeline records every attempt.
- Benchmarks and the Upload tab share the same `decodePixelBuffer` implementation.
- A user cancel or replacement upload terminates the active Worker immediately; the next task lazily creates one Worker, and unmount disposes it.
- Tests can force `jsqr` or `zxing` through `PipelineConfig.decoders`; production keeps both enabled.

## Privacy

Upload-mode decoding runs in a dedicated Web Worker so the main thread stays responsive. Camera mode continues to use `@zxing/browser` directly.

```text
components/QRTool.tsx
  └── lib/qr/decode-upload.ts       Browser file load + worker dispatch
        └── lib/qr/worker/worker-client.ts   jobId ownership, cancel → terminate
              └── lib/qr/worker/decode-worker.ts
                    └── lib/qr/decode-pipeline.ts
```

Node benchmarks and Vitest call `decodePixelBuffer()` on the main thread via `forceMainThread`.
