import { afterAll, describe, expect, it } from "vitest";
import { createRgbaFrame } from "@scanly/core";
import { createPixelBuffer } from "@scanly/core/qr";
import { decodePixelBufferWithNodeEngines as decodePixelBuffer, loadPixelBufferFromPath } from "@scanly/node";
import { ZxingJsEngine } from "@scanly/engine-zxing-js";
import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import os from "node:os";

const FIXTURES = path.resolve(__dirname, "../../fixtures");
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "scanly-zxing-tests-"));

afterAll(() => fs.rmSync(TEMP_DIR, { recursive: true, force: true }));

describe("ZXing forced tests", () => {
  it("decodeWithZXing returns exact payload on clear generated QR", async () => {
    const file = path.join(TEMP_DIR, "zxing-adapter.png");
    if (!fs.existsSync(file)) {
      const buf = await QRCode.toBuffer("SCANLY_ZXING_ADAPTER", {
        type: "png",
        width: 300,
        errorCorrectionLevel: "H",
      });
      fs.writeFileSync(file, buf);
    }
    const pixel = await loadPixelBufferFromPath(file);
    const result = await new ZxingJsEngine().decode(createRgbaFrame(pixel.data, pixel.width, pixel.height), { formats: ["qr_code"], findMultiple: false });
    expect(result.ok && result.results[0].text).toBe("SCANLY_ZXING_ADAPTER");
  });

  it("ZXing engine returns a typed miss on empty buffer without throwing", async () => {
    const empty = createPixelBuffer(new Uint8ClampedArray(0), 0, 0);
    const result = await new ZxingJsEngine().decode(createRgbaFrame(empty.data, 0, 0), { formats: ["qr_code"], findMultiple: false });
    expect(result.ok).toBe(false);
  });

  it("decodeWithZXing returns null for a real blank image", async () => {
    const file = path.join(TEMP_DIR, "zxing-blank.png");
    await sharp({ create: { width: 200, height: 200, channels: 3, background: "#ffffff" } })
      .png()
      .toFile(file);
    const pixel = await loadPixelBufferFromPath(file);
    const result = await new ZxingJsEngine().decode(createRgbaFrame(pixel.data, pixel.width, pixel.height), { formats: ["qr_code"], findMultiple: false });
    expect(result.ok).toBe(false);
  });

  it("ZXing-only pipeline decodes clear fixture with zxing decoder", async () => {
    const file = path.join(FIXTURES, "02-clear-text.png");
    expect(fs.existsSync(file), `Missing canonical fixture: ${file}`).toBe(true);
    const buffer = await loadPixelBufferFromPath(file);
    const out = await decodePixelBuffer(buffer, {
      config: {
        findMultiple: false,
        decoders: { order: ["zxing-js"], execution: "sequential" },
      },
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.primary.payload).toBe("SCANLY_CLEAR_TEXT");
      expect(out.primary.decoder).toBe("zxing-js");
    }
  });

  it("jsQR-only pipeline still works", async () => {
    const file = path.join(FIXTURES, "02-clear-text.png");
    expect(fs.existsSync(file), `Missing canonical fixture: ${file}`).toBe(true);
    const buffer = await loadPixelBufferFromPath(file);
    const out = await decodePixelBuffer(buffer, {
      config: {
        findMultiple: false,
        decoders: { order: ["jsqr"], execution: "sequential" },
      },
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.primary.decoder).toBe("jsqr");
  });

  it("continues selected ZXing candidates after a no-result attempt", async () => {
    const buffer = await loadPixelBufferFromPath(path.join(FIXTURES, "11-complex-background.jpg"));
    const out = await decodePixelBuffer(buffer, {
      config: {
        findMultiple: false,
        maxAttempts: 20,
        decoders: { order: ["zxing-js"], execution: "sequential" },
      },
    });
    expect(out.ok).toBe(false);
    expect(out.attemptCount).toBeGreaterThan(1);
    expect(out.attempts.every((attempt) => attempt.decoder === "zxing-js")).toBe(true);
  });
});
