import { createNodeCaptureRouter } from "@scanly/node";
import { PUBLIC_BARCODE_FORMATS } from "@scanly/core";

/**
 * Contract-level smoke report for Alpha.5 format routing. Accuracy evidence is
 * intentionally produced only by the canonical fixture runner after a corpus
 * is available and the source tree has been frozen.
 */
async function main(): Promise<void> {
  const router = createNodeCaptureRouter();
  try {
    const capabilities = router.getCapabilities();
    const engineFormats = Object.fromEntries(capabilities.engines.map((engine) => [engine.id, engine.capabilities.formats]));
    const report = {
      schemaVersion: "alpha5-symbology-contract-1",
      sdkVersion: "2.0.0-alpha.5",
      formats: PUBLIC_BARCODE_FORMATS,
      engineFormats,
      evidenceStatus: "contract-only; fixture benchmark pending",
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await router.dispose();
  }
}

void main();
