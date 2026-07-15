# SDK usage

The v2 packages are preview packages prepared for later publication; this repository does not publish them automatically.

## Plain browser JavaScript

```js
import { BrowserCaptureSession } from "@scanly/browser";

const scanner = new BrowserCaptureSession();
scanner.initialize();
scanner.start();

const outcome = await scanner.scanFile(fileInput.files[0]);
if (outcome.ok) {
  for (const result of outcome.results) console.log(result.rawText);
} else {
  console.error(outcome.error.code, outcome.error.message);
}

scanner.dispose();
```

The browser runtime uses a module Worker by default and transfers the decoded RGBA backing buffer. Pass `{ forceMainThread: true }` only for environments that cannot create a Worker.

## TypeScript pixel-buffer input

```ts
import { CaptureRouter, createRgbaFrame } from "@scanly/core";
import { getBuiltinScenario } from "@scanly/scenario-schema";

const router = new CaptureRouter({ scenario: getBuiltinScenario("balanced") });
const frame = createRgbaFrame(rgba, width, height, {
  id: crypto.randomUUID(),
  sourceType: "pixel-buffer",
  ownership: "borrowed",
});
const outcome = await router.scan(frame, { signal: abortController.signal });
```

Borrowed buffers remain caller-owned. For `owned` or `transferred` frames, supply `dispose` when the source has a release contract; the Router calls it after the frame finishes.

## React

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
    <button type="button" onClick={cancel} disabled={!scanning}>Cancel</button>
    <output>{outcome?.ok ? outcome.primary.rawText : ""}</output>
  </>;
}
```

React does not participate in decoding. The hook disposes its browser session and Worker on unmount.

## Cancellation and repeated scans

```ts
const controller = new AbortController();
const pending = scanner.scanFile(file, { signal: controller.signal });
controller.abort();
const cancelled = await pending; // error.code === "cancelled"

// The Worker is recreated lazily; the same session can scan again.
const recovered = await scanner.scanFile(nextFile);
```

## Multiple codes

The balanced and robust profiles enable multi-code collection. Success is always non-empty:

```ts
if (outcome.ok) {
  const [primary, ...additional] = outcome.results;
  console.log(primary.rawText, additional.map((item) => item.rawText));
}
```

## Custom scenario

```ts
import { getBuiltinScenario, validateScenario } from "@scanly/scenario-schema";

const scenario = getBuiltinScenario("balanced");
scenario.id = "warehouse.preview";
scenario.revision = 1;
scenario.multiCode.maxResults = 12;
scenario.budgets.maxExecutionMs = 15_000;

const checked = validateScenario(scenario);
if (!checked.ok) throw new Error(checked.message);
scanner.updateConfiguration(checked.value);
```

Changing a session configuration cancels its current job so results from the old scenario cannot cross the ownership boundary.

## Camera lifecycle

```ts
import { BrowserCameraSource } from "@scanly/browser";

const camera = new BrowserCameraSource();
await camera.start(videoElement, {
  deviceId,
  stopAfterResult: true,
  onResult: (result) => console.log(result.ok && result.primary.rawText),
  onError: (failure) => console.error(failure.error.code),
});
const capabilities = camera.getCapabilities();
if (capabilities.torch) await camera.setTorch(true);
camera.stop(); // stops every MediaStream track
camera.dispose();
```

Never infer physical torch/zoom support from desktop emulation. Query the active track and test the actual device.

## Safe actions

Semantic parsing never executes an action. The reference app enables an Open Link control only when `isSafeActionUrl(rawText)` accepts an explicit HTTP or HTTPS URL. Wi-Fi, telephone, SMS, email, calendar, and geo payloads remain data until the host application asks the user and performs an action.
