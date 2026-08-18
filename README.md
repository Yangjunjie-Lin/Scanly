# Scanly SDK v2.0.0

Privacy-first, local-only barcode scanning SDK for Web, Node.js, React, iOS, and Android.

[![SDK 2.0.0](https://img.shields.io/badge/SDK-2.0.0-green)](https://github.com/Yangjunjie-Lin/Scanly/releases/tag/v2.0.0)
[![npm latest](https://img.shields.io/badge/npm-latest-CB3837)](https://www.npmjs.com/package/@scanly/browser)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**Live demo:** [qr-decoder-theta.vercel.app](https://qr-decoder-theta.vercel.app)

![Scanly upload decode](docs/screenshot.png)

## Install

Choose the package for your runtime. Browser, Node, and React packages already include their required Scanly workspace dependencies.

```bash
npm install @scanly/browser
npm install @scanly/node
npm install @scanly/react
```

Advanced engine composition can use `@scanly/core` directly:

```bash
npm install @scanly/core
```

- **iOS:** v2.0.0 ships a Swift Package Manager source package under `native/ios`. Because the manifest is not at the repository root, check out tag `v2.0.0` and add `native/ios` as a local package. See the [iOS guide](docs/native/ios-getting-started.md).
- **Android:** download `scanly-sdk-2.0.0.aar` from the [v2.0.0 GitHub Release](https://github.com/Yangjunjie-Lin/Scanly/releases/tag/v2.0.0). Maven Central is not a v2.0.0 distribution channel. See the [Android guide](docs/native/android-getting-started.md).

## Quick start

### Browser

```js
import { BrowserCaptureSession } from "@scanly/browser";

const scanner = new BrowserCaptureSession();
scanner.initialize();
scanner.start();

const outcome = await scanner.scanFile(file);
if (outcome.ok) console.log(outcome.results);

await scanner.dispose();
```

Camera access uses `BrowserCameraSource`, requires HTTPS or localhost, and remains subject to browser permission and hardware capability.

### Node.js

```js
import { createNodeCaptureRouter, loadNormalizedFrameFromPath } from "@scanly/node";

const router = createNodeCaptureRouter({ formats: ["qr_code", "data_matrix"] });
const frame = await loadNormalizedFrameFromPath("label.png");
const outcome = await router.scan(frame);
if (outcome.ok) console.log(outcome.results);
await router.dispose();
```

### React

```tsx
"use client";
import { useScanly } from "@scanly/react";

export function Scanner() {
  const { outcome, scanning, scanFile } = useScanly();
  return <>
    <input type="file" accept="image/*" onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      if (file) void scanFile(file);
    }} />
    <output>{scanning ? "Scanning…" : outcome?.ok ? outcome.primary.rawText : ""}</output>
  </>;
}
```

### iOS

```swift
import ScanlySDK

let decoder = try ScanlyDecoder()
let results = try decoder.decode(pixelBuffer, options: ScanlyOptions(
    formats: [.qrCode, .dataMatrix],
    maxResults: 8
))
```

### Android

```kotlin
val decoder = ScanlyDecoder()
val session = ScanlyScannerSession(
    decoder,
    ScanlyOptions(formats = setOf(ScanlyBarcodeFormat.QR_CODE), maxResults = 8),
)
session.onResults = { outcome -> outcome.onSuccess(::renderResults) }
```

## Supported formats

- QR Code Model 2
- Data Matrix ECC 200
- PDF417
- Code 128
- EAN-13 and EAN-8
- UPC-A and UPC-E

The default scenario remains QR-only for compatibility. Select additional formats explicitly. The JavaScript jsQR and ZXing-JS adapters are QR-only; the default Browser and Node composition lazily loads the ZXing-C++ WASM engine for the full public format set. See [symbology support](docs/symbologies.md).

## Core capabilities

- Image upload and realtime camera scanning
- Multiple-code results, tracking, and batch identity
- Bounded industrial recovery for difficult symbols
- Browser Worker execution and lazy, self-hosted ZXing-C++ WASM
- Framework-independent routing and engine registration
- Native iOS and Android wrappers over the shared C++ decode core

Industrial recovery is not an industrial, warehouse, or DPM certification. The `dpm-experimental` profile is opt-in.

## Privacy

Scanly decodes locally and remains offline-capable after code and WASM assets are loaded. The SDK does not upload images or payloads and contains no analytics, remote logging, account, or cloud-decoder service. Host applications remain responsible for their own telemetry, storage, and privacy disclosures.

## Platform status

v2.0.0 is the published Stable software line. Automated browser, Node, simulator, emulator, API/ABI, security, package, and artifact checks are verified. Automated coverage is not physical-device qualification.

Physical Web iOS/Android, Native iOS/Android, 30-minute and 60-minute camera soaks, and the complete hardware matrix remain `POST_RELEASE_VALIDATION_PENDING` under [Issue #13](https://github.com/Yangjunjie-Lin/Scanly/issues/13). No all-device-verified claim is made.

Known limitations include hardware-dependent camera capabilities, difficult or occluded symbols, experimental DPM recovery, unsupported Android `armeabi-v7a`, no Maven Central or CocoaPods distribution for v2.0.0, and the pending physical-device matrix.

## Branch and release status

- `main` contains the current v2.0.0 Stable line.
- `develop/sdk-v2` is the integration branch for post-v2 maintenance and the next patch/minor line.
- Feature and fix branches start from `develop/sdk-v2`.
- Historical release branches and immutable RC/Stable tags preserve qualification ancestry; `release/sdk-v2-v2.0.0` is not a development base.

Detailed Alpha, Beta, and RC development evidence is preserved in [development history](docs/history/sdk-v2-development-history.md) and under `release/`.

## Documentation

- [Documentation index](docs/README.md)
- [SDK usage](docs/sdk/usage.md)
- [Public API](docs/sdk/public-api.md)
- [Worker and WASM deployment](docs/sdk/worker-deployment.md)
- [Platform compatibility](docs/platform-compatibility.md)
- [Migration from v1](docs/migration/v1-to-v2.md)
- [Security policy](SECURITY.md)

## Release integrity

- [v2.0.0 release notes](docs/releases/v2.0.0.md)
- [Changelog](CHANGELOG.md)
- [Qualification manifest](release/stable/v2.0.0-manifest.json)
- [Publication record](release/stable/v2.0.0-publication-record.json)
- [SBOM](release/stable/sbom.cdx.json)
- [Third-party notices](THIRD_PARTY_NOTICES)

Published v2.0.0 artifacts, tags, and historical qualification evidence are immutable. Later documentation and maintenance changes do not replace those bytes.

## Contributing, security, and license

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and the [maintenance policy](docs/maintenance.md).

[MIT License](LICENSE)
