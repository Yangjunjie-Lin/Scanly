const expectedExports = [
  ["@scanly/scenario-schema", "SCENARIO_SCHEMA_VERSION"],
  ["@scanly/parsers", "parseSemanticPayload"],
  ["@scanly/benchmark", "BENCHMARK_SCHEMA_VERSION"],
  ["@scanly/core", "SDK_VERSION"],
  ["@scanly/core/qr", "decodePixelBuffer"],
  ["@scanly/node", "loadPixelBufferFromPath"],
  ["@scanly/browser", "BROWSER_SDK_VERSION"],
  ["@scanly/react", "useScanly"],
  ["@scanly/engine-jsqr", "JsQrEngine"],
  ["@scanly/engine-zxing-js", "ZxingJsEngine"],
];

for (const [specifier, expectedExport] of expectedExports) {
  const module = await import(specifier);
  if (!(expectedExport in module)) {
    throw new Error(`${specifier} did not expose ${expectedExport}.`);
  }
}

console.log(`Native ESM import smoke passed for ${expectedExports.length} public entry points.`);
