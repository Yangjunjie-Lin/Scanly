# @scanly/react

Thin React adapter over `@scanly/browser` for Scanly SDK v2.0.0. Decoding, Worker ownership, camera runtime, tracking, and memory management remain outside React.

```bash
npm install @scanly/react
```

```tsx
"use client";
import { useScanly } from "@scanly/react";

export function UploadScanner() {
  const { outcome, scanning, scanFile, cancel } = useScanly();
  return <>
    <input type="file" accept="image/*" onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      if (file) void scanFile(file);
    }} />
    <button onClick={cancel} disabled={!scanning}>Cancel</button>
    <output>{outcome?.ok ? outcome.primary.rawText : ""}</output>
  </>;
}
```

`useScanly` owns one `BrowserCaptureSession`, starts it after mount, and disposes its session and Worker on unmount. For camera UI, compose `BrowserCameraSource` from `@scanly/browser` in an effect and stop/dispose it in the effect cleanup.

This is the standard public React package for React 18 and 19-compatible peer ranges (`>=18 <20`).

Version: 2.0.0 · [React usage](https://github.com/Yangjunjie-Lin/Scanly/blob/main/docs/sdk/usage.md)
