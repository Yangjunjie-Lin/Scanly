import { afterEach, describe, expect, it } from "vitest";
import {
  createZxingCppWasmEngine,
  supportsWasmSimd,
  ZxingCppWasmError,
  ZxingCppWasmLoader,
} from "@scanly/engine-zxing-cpp-wasm";

const disposables: Array<{ dispose(): Promise<void> }> = [];
afterEach(async () => {
  await Promise.allSettled(disposables.splice(0).map((entry) => entry.dispose()));
});

describe("ZXing-C++ WASM loader lifecycle", () => {
  it("deduplicates concurrent initialization and selects the packaged standard variant", async () => {
    const loader = new ZxingCppWasmLoader();
    disposables.push(loader);
    const first = loader.initialize();
    const second = loader.initialize();
    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(loader.initializationState).toBe("ready");
    expect(loader.selectedVariant).toBe("standard");
    expect((loader.readerModule as unknown as { HEAPU8: Uint8Array }).HEAPU8.byteLength).toBeGreaterThan(0);
  });

  it("reports missing and corrupted assets with typed failures", async () => {
    const missing = new ZxingCppWasmLoader({ assetResolver: () => new URL("file:///definitely-missing/scanly.wasm"), maxInitializationAttempts: 1 });
    disposables.push(missing);
    await expect(missing.initialize()).rejects.toMatchObject({ name: "ZxingCppWasmError", code: "asset_not_found" });
    expect(missing.initializationState).toBe("failed");

    const corrupted = new ZxingCppWasmLoader({ assetResolver: () => Uint8Array.from([0, 1, 2, 3]), verifyAssetIntegrity: false, maxInitializationAttempts: 1 });
    disposables.push(corrupted);
    await expect(corrupted.initialize()).rejects.toMatchObject({ code: "wasm_compile_failed" });
  });

  it("retries a recoverable load once and then closes the failure circuit", async () => {
    let resolutions = 0;
    const recovered = new ZxingCppWasmLoader({
      maxInitializationAttempts: 2,
      assetResolver: () => ++resolutions === 1
        ? new URL("file:///definitely-missing/first-attempt.wasm")
        : new URL("../../engines/zxing-cpp-wasm/wasm/zxing-cpp.wasm", import.meta.url),
    });
    disposables.push(recovered);
    await expect(recovered.initialize()).rejects.toMatchObject({ code: "asset_not_found" });
    await expect(recovered.initialize()).resolves.toBeUndefined();
    expect(recovered.initializationState).toBe("ready");
    expect(resolutions).toBe(2);

    const circuit = new ZxingCppWasmLoader({
      maxInitializationAttempts: 2,
      assetResolver: () => new URL("file:///definitely-missing/always.wasm"),
    });
    disposables.push(circuit);
    await expect(circuit.initialize()).rejects.toMatchObject({ code: "asset_not_found" });
    await expect(circuit.initialize()).rejects.toMatchObject({ code: "asset_not_found" });
    await expect(circuit.initialize()).rejects.toThrow(/circuit is open/);
  });

  it("does not silently use an unavailable SIMD artifact", async () => {
    const loader = new ZxingCppWasmLoader({ variant: "simd", maxInitializationAttempts: 1 });
    disposables.push(loader);
    await expect(loader.initialize()).rejects.toMatchObject({ code: supportsWasmSimd() ? "unsupported_simd" : "unsupported_simd" });
  });

  it("rejects use after disposal", async () => {
    const engine = createZxingCppWasmEngine();
    await engine.initialize();
    await engine.dispose();
    await expect(engine.initialize()).rejects.toBeInstanceOf(ZxingCppWasmError);
    expect(engine.initializationState).toBe("disposed");
    expect(() => engine.getMemoryObservation()).not.toThrow();
  });
});
