import { describe, expect, it } from "vitest";
import { decodeWithZXing } from "../../lib/qr/zxing-decoder";
import { decodePixelBuffer } from "../../lib/qr/decode-pipeline";
import { loadPixelBufferFromPath } from "../../lib/qr/image-loader-node";
import { createPixelBuffer } from "../../lib/qr/grayscale";
import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const FIXTURES = path.resolve(__dirname, "../../fixtures");

describe("ZXing forced tests", () => {
  it("decodeWithZXing returns exact payload on clear generated QR", async () => {
    const file = path.join(FIXTURES, "_tmp-zxing-adapter.png");
    if (!fs.existsSync(file)) {
      const buf = await QRCode.toBuffer("SCANLY_ZXING_ADAPTER", {
        type: "png",
        width: 300,
        errorCorrectionLevel: "H",
      });
      fs.writeFileSync(file, buf);
    }
    const pixel = await loadPixelBufferFromPath(file);
    const result = decodeWithZXing(pixel);
    expect(result?.payload).toBe("SCANLY_ZXING_ADAPTER");
  });

  it("decodeWithZXing returns null on empty buffer without throwing", () => {
    const empty = createPixelBuffer(new Uint8ClampedArray(0), 0, 0);
    expect(decodeWithZXing(empty)).toBeNull();
  });

  it("decodeWithZXing returns null for a real blank image", async () => {
    const file = path.join(FIXTURES, "_tmp-zxing-blank.png");
    await sharp({ create: { width: 200, height: 200, channels: 3, background: "#ffffff" } })
      .png()
      .toFile(file);
    expect(decodeWithZXing(await loadPixelBufferFromPath(file))).toBeNull();
  });

  it("ZXing-only pipeline decodes clear fixture with zxing decoder", async () => {
    const file = path.join(FIXTURES, "02-clear-text.png");
    if (!fs.existsSync(file)) return;
    const buffer = await loadPixelBufferFromPath(file);
    const out = await decodePixelBuffer(buffer, {
      config: {
        findMultiple: false,
        decoders: { jsqr: false, zxing: true, decoderOrder: ["zxing"] },
      },
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.primary.payload).toBe("SCANLY_CLEAR_TEXT");
      expect(out.primary.decoder).toBe("zxing");
    }
  });

  it("jsQR-only pipeline still works", async () => {
    const file = path.join(FIXTURES, "02-clear-text.png");
    if (!fs.existsSync(file)) return;
    const buffer = await loadPixelBufferFromPath(file);
    const out = await decodePixelBuffer(buffer, {
      config: {
        findMultiple: false,
        decoders: { jsqr: true, zxing: false, decoderOrder: ["jsqr"] },
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
        decoders: { jsqr: false, zxing: true, decoderOrder: ["zxing"] },
      },
    });
    expect(out.ok).toBe(false);
    expect(out.attemptCount).toBeGreaterThan(1);
    expect(out.attempts.every((attempt) => attempt.decoder === "zxing")).toBe(true);
  });
});
