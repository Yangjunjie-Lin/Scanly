import { describe, expect, it } from "vitest";
import { SdkException } from "@scanly/core";
import { createNodeCaptureRouter } from "@scanly/node";
import { getBuiltinScenario } from "@scanly/scenario-schema";

describe("truthful runtime capabilities", () => {
  it("reports the installed formats, pixel adapters, engines, and unsupported temporal features", async () => {
    const router = createNodeCaptureRouter();
    try {
      const capabilities = router.getCapabilities();
      expect(capabilities.formats).toEqual(["code_128", "data_matrix", "ean_13", "ean_8", "pdf417", "qr_code", "upc_a", "upc_e"]);
      expect(capabilities.pixelFormats).toEqual(["rgba8888", "rgb888", "gray8"]);
      expect(capabilities.scenarioFeatures).toMatchObject({ roi: true, parallelEngines: true, spatialDeduplication: true, temporalTracking: false, heuristicQuality: false, yuvNormalization: false });
      expect(capabilities.engines.map((engine) => engine.id)).toEqual(["jsqr", "zxing-cpp-wasm", "zxing-js"]);
      expect(capabilities.engines.every((engine) => engine.capabilities.estimatedScratchBytesPerPixel !== undefined)).toBe(true);
    } finally { await router.dispose(); }
  });

  it("rejects tracked-instance during scenario compilation", async () => {
    const router = createNodeCaptureRouter();
    const scenario = getBuiltinScenario("balanced"); scenario.multiCode.deduplication = "tracked-instance";
    try {
      expect(() => router.updateScenario(scenario)).toThrowError(SdkException);
      expect(() => router.updateScenario(scenario)).toThrow(/temporal tracking operator/);
    } finally { await router.dispose(); }
  });
});
