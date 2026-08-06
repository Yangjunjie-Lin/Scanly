const expectedExports = [
  ["@scanly/scenario-schema", "SCENARIO_SCHEMA_VERSION"],
  ["@scanly/parsers", "parseSemanticPayload"],
  ["@scanly/benchmark", "BENCHMARK_SCHEMA_VERSION"],
  ["@scanly/core", "SDK_VERSION"],
  ["@scanly/core", "PUBLIC_BARCODE_FORMATS"],
  ["@scanly/core", "normalizeRetailBarcode"],
  ["@scanly/core/qr", "decodePixelBuffer"],
  ["@scanly/node", "loadPixelBufferFromPath"],
  ["@scanly/node", "createNodeCaptureRouter"],
  ["@scanly/browser", "BROWSER_SDK_VERSION"],
  ["@scanly/browser", "createBrowserCaptureRouter"],
  ["@scanly/react", "useScanly"],
  ["@scanly/engine-jsqr", "JsQrEngine"],
  ["@scanly/engine-zxing-js", "ZxingJsEngine"],
  ["@scanly/engine-zxing-cpp-wasm", "createZxingCppWasmEngine"],
];

const alpha5Formats = [
  "qr_code",
  "data_matrix",
  "pdf417",
  "code_128",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
];

for (const [specifier, expectedExport] of expectedExports) {
  const module = await import(specifier);
  if (!(expectedExport in module)) {
    throw new Error(`${specifier} did not expose ${expectedExport}.`);
  }
}

const core = await import("@scanly/core");
if (core.SDK_VERSION !== "2.0.0-alpha.5") {
  throw new Error(`Installed @scanly/core version is ${core.SDK_VERSION}, expected 2.0.0-alpha.5.`);
}
for (const format of alpha5Formats) {
  if (!core.PUBLIC_BARCODE_FORMATS.includes(format)) {
    throw new Error(`PUBLIC_BARCODE_FORMATS is missing ${format}.`);
  }
}
if (typeof core.normalizeRetailBarcode !== "function") {
  throw new Error("@scanly/core normalizeRetailBarcode is missing.");
}

const node = await import("@scanly/node");
const browser = await import("@scanly/browser");
if (typeof node.createNodeCaptureRouter !== "function") throw new Error("@scanly/node createNodeCaptureRouter is missing.");
if (typeof browser.createBrowserCaptureRouter !== "function") throw new Error("@scanly/browser createBrowserCaptureRouter is missing.");

const nodeRouter = node.createNodeCaptureRouter();
const browserRouter = browser.createBrowserCaptureRouter();
if (!nodeRouter || !browserRouter) throw new Error("Router factories returned empty values.");

const wasm = await import("@scanly/engine-zxing-cpp-wasm");
const engine = wasm.createZxingCppWasmEngine();
await engine.initialize();
await engine.dispose();

console.log(`Native ESM import smoke passed for ${expectedExports.length} public entry points and Alpha.5 format surface.`);
