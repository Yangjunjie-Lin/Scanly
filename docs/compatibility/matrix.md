# Compatibility matrix

## Alpha.5 public formats

| Format family | Browser main | Worker | Node | Engine status |
| --- | --- | --- | --- | --- |
| QR Code Model 2 | supported | supported | supported | jsQR/ZXing-JS fallback, ZXing-C++ primary |
| Data Matrix ECC 200 | adapter path | adapter path | adapter path | ZXing-C++ primary; fixture evidence pending |
| PDF417 | adapter path | adapter path | adapter path | ZXing-C++ primary; Macro/Micro deferred |
| Code 128 and GS1-128 | adapter path | adapter path | adapter path | ZXing-C++ primary; bounded GS1 semantics |
| EAN/UPC core | adapter path | adapter path | adapter path | ZXing-C++ primary; checksum validation required |

"Adapter path" describes the same local Worker/Node composition and pinned WASM boundary; it is not a claim that Alpha.5 canonical accuracy gates have already been generated.

| ZXing-C++ WASM capability | Chromium | Firefox | WebKit | Node 20.16–24 |
| --- | --- | --- | --- | --- |
| Standard WASM | supported | supported | supported | supported |
| Worker-local module | supported | supported | supported | n/a |
| SIMD asset | not shipped | not shipped | not shipped | not shipped |
| Package-relative local asset | supported when deployed | supported when deployed | supported when deployed | supported |

These are supported paths, not a claim that every browser/device combination has completed physical-device validation. Automated results record the actual engine and variant.

| Environment | Automated coverage | Manual physical device | Status |
| --- | --- | --- | --- |
| Chrome desktop | Chromium E2E, Worker/upload, camera error abstractions | none recorded in this branch | upload verified; hardware camera unverified |
| Edge desktop | Chromium engine compatibility inference | none | unverified as a branded browser run |
| Firefox desktop | Worker/upload smoke | none | automated upload smoke |
| Safari desktop | WebKit Worker/upload smoke | none | automated WebKit smoke |
| iOS Safari | none (desktop WebKit is not iOS) | none | unverified |
| Android Chrome | none | none | unverified |
| Node.js 20–24 | unit/integration/package/benchmark on configured CI/local runtimes | n/a | core/benchmark tools supported |

Camera device switching, page visibility cleanup, capability detection, and orientation notification have abstraction tests or deterministic lifecycle code. Torch, zoom, autofocus, permission recovery, thermal throttling, and long-running camera behavior require physical-device validation.

Core public interfaces do not depend on Next.js or React. Android, iOS, Windows, Linux native, Python, .NET, and ZXing-C++ WASM bindings are not implemented.
