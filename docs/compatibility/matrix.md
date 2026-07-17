# Compatibility matrix

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
