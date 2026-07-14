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
├── result-normalizer.ts
└── benchmark-types.ts
```

## Design rules

- Image algorithms are pure functions over `PixelBuffer`.
- UI owns AbortController, camera tracks, and presentation state.
- Decoder adapters return normalized payloads; the pipeline records every attempt.
- Benchmarks and the Upload tab share the same `decodePixelBuffer` implementation.

## Privacy

Upload and camera frames are processed locally. Object URLs / bitmaps are released after decode. There is no analytics SDK and no image upload API route.
