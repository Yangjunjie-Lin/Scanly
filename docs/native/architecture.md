# Native mobile architecture

Scanly SDK v2.0.1 uses one shared ZXing-C++ decode implementation behind a
stable C ABI. The web runtime continues to use the pinned ZXing-C++ WASM
adapter; Swift and Kotlin do not select independent decoder libraries.

```text
                              +-- Web / WASM
Pinned ZXing-C++ decode core -+-- Node composition
                              +-- Scanly C ABI -- Swift
                              +-- Scanly C ABI -- JNI -- Kotlin
```

The pinned revision is `6c2961d2a9ea4bc4e4ae8f37b1497299f04dd861`.
`native/core` owns decode, format filtering, multiple results, original-image
geometry, raw payload bytes, checksum metadata, engine diagnostics, validation,
and typed failures. Complex C++ types never cross the ABI.

## Frame paths

- iOS NV12 uses the `CVPixelBuffer` Y plane directly; BGRA uses the locked base
  address. Neither path creates `UIImage`, PNG, or JPEG data.
- Android CameraX passes the `YUV_420_888` Y-plane direct `ByteBuffer` through
  JNI. `ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST` bounds backpressure; no Bitmap
  or JPEG conversion is used.
- Each decoder context serializes access. Separate contexts may run in
  parallel. Scanner sessions also allow only one active decode and invalidate
  stale generations after lifecycle transitions.

## Session strategy

v2.0.1 uses the platform-wrapper strategy for frame scheduling, lifecycle,
latest-frame admission, repeat suppression, and stale-result discard. The
portable C++ boundary remains decode-only. Cross-platform session behavior is
constrained by deterministic contracts and may be converged further in a future minor release;
full Web tracking/batch parity is deliberately P2 and is not claimed here.

## Geometry contract

All points and bounding boxes use the original input image coordinate space,
top-left origin, before any UI preview transform. Corner order is top-left,
top-right, bottom-right, bottom-left. Cross-platform fixtures allow a two-pixel
tolerance; floating-point points are not required to be bit-identical.

## Privacy

Decode is local. The Native SDK and samples have no cloud decoder, frame upload,
analytics, advertising, or tracking SDK. Host applications remain responsible
for their own privacy disclosures and camera permission strings.

## Validation boundary

Compiler, unit, fixture, simulator, and emulator results are automated
integration evidence. They are not physical-device evidence. Physical Web and
Native iOS/Android validation is `POST_RELEASE_VALIDATION_PENDING` and remains
tracked by Issue #13.
