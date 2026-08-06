import { beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import path from "node:path";
import { createRequire } from "node:module";
import fs from "node:fs";
import { prepareZXingModule, writeBarcode } from "zxing-wasm/writer";
import { createRgbaFrame, type NormalizedFrame } from "@scanly/core";
import { createZxingCppWasmEngine } from "@scanly/engine-zxing-cpp-wasm";
import { createNodeCaptureRouter } from "@scanly/node";
import type { BarcodeFormat } from "@scanly/scenario-schema";

interface SymbologyCase {
  format: BarcodeFormat;
  nativeFormat: "QRCode" | "DataMatrix" | "PDF417" | "Code128" | "EAN13" | "EAN8" | "UPCA" | "UPCE";
  payload: string;
}

const CASES: readonly SymbologyCase[] = [
  { format: "qr_code", nativeFormat: "QRCode", payload: "SCANLY-QR-ALPHA5" },
  { format: "data_matrix", nativeFormat: "DataMatrix", payload: "SCANLY-DM-ECC200" },
  { format: "pdf417", nativeFormat: "PDF417", payload: "SCANLY-PDF417-ALPHA5" },
  { format: "code_128", nativeFormat: "Code128", payload: "SCANLY-CODE128-123456" },
  { format: "ean_13", nativeFormat: "EAN13", payload: "4006381333931" },
  { format: "ean_8", nativeFormat: "EAN8", payload: "96385074" },
  { format: "upc_a", nativeFormat: "UPCA", payload: "036000291452" },
  { format: "upc_e", nativeFormat: "UPCE", payload: "04252614" },
] as const;

async function generatedFrame(testCase: SymbologyCase): Promise<NormalizedFrame> {
  const written = await writeBarcode(testCase.payload, {
    format: testCase.nativeFormat,
    scale: 5,
    addQuietZones: true,
  });
  if (written.error || !written.image) {
    throw new Error(`Unable to generate ${testCase.nativeFormat}: ${written.error || "writer returned no image"}`);
  }
  const encoded = Buffer.from(await written.image.arrayBuffer());
  const { data, info } = await sharp(encoded).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return createRgbaFrame(
    new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    info.width,
    info.height,
  );
}

describe("ZXing-C++ Alpha.5 multi-symbology integration", () => {
  const frames = new Map<BarcodeFormat, NormalizedFrame>();

  beforeAll(async () => {
    const require = createRequire(import.meta.url);
    const writerAsset = path.resolve(path.dirname(require.resolve("zxing-wasm/writer")), "../../writer/zxing_writer.wasm");
    prepareZXingModule({ overrides: { locateFile: () => writerAsset, wasmBinary: fs.readFileSync(writerAsset) } });
    for (const testCase of CASES) frames.set(testCase.format, await generatedFrame(testCase));
  }, 30_000);

  it.each(CASES)("decodes $format through the pinned reader WASM", async (testCase) => {
    const engine = createZxingCppWasmEngine();
    try {
      const outcome = await engine.decode(frames.get(testCase.format)!, {
        formats: [testCase.format],
        findMultiple: false,
      });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.results).toHaveLength(1);
      expect(outcome.results[0]).toMatchObject({
        text: testCase.payload,
        format: testCase.format,
      });
      expect(outcome.results[0].rawBytes?.byteLength).toBeGreaterThan(0);
      expect(outcome.results[0].cornerPoints).toHaveLength(4);
    } finally {
      await engine.dispose();
    }
  });

  it("does not decode a Data Matrix when the request is QR-only", async () => {
    const engine = createZxingCppWasmEngine();
    try {
      const outcome = await engine.decode(frames.get("data_matrix")!, {
        formats: ["qr_code"],
        findMultiple: false,
      });
      expect(outcome).toMatchObject({ ok: false, category: "not-found" });
    } finally {
      await engine.dispose();
    }
  });

  it("preserves UPC formats when all Alpha.5 formats are requested", async () => {
    const engine = createZxingCppWasmEngine();
    try {
      for (const testCase of CASES.filter(({ format }) => format === "upc_a" || format === "upc_e")) {
        const outcome = await engine.decode(frames.get(testCase.format)!, {
          formats: CASES.map(({ format }) => format),
          findMultiple: false,
        });
        expect(outcome.ok).toBe(true);
        if (outcome.ok) expect(outcome.results[0]).toMatchObject({ format: testCase.format, text: testCase.payload });
      }
    } finally {
      await engine.dispose();
    }
  });

  it("preserves format selection through the full Node CaptureRouter", async () => {
    const router = createNodeCaptureRouter();
    try {
      for (const testCase of CASES) {
        const outcome = await router.scan(frames.get(testCase.format)!, { formats: [testCase.format] });
        expect(outcome.ok, `${testCase.format} should decode`).toBe(true);
        if (!outcome.ok) continue;
        expect(outcome.primary).toMatchObject({
          format: testCase.format,
          rawText: testCase.payload,
          engine: { id: "zxing-cpp-wasm" },
        });
      }
    } finally {
      await router.dispose();
    }
  }, 60_000);
});
