import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import QRCode from "qrcode";
import sharp from "sharp";
import os from "node:os";
import { loadPixelBufferFromPath } from "@scanly/core/node";
import { decodePixelBuffer, createPixelBuffer } from "@scanly/core/qr";

const ROOT = path.resolve(__dirname, "../..");
const FIXTURES = path.join(ROOT, "fixtures");
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "scanly-tests-"));

afterAll(() => fs.rmSync(TEMP_DIR, { recursive: true, force: true }));

async function ensureTempQr(payload: string, fileName: string, invert = false) {
  const file = path.join(TEMP_DIR, fileName);
  if (!fs.existsSync(file)) {
    const buf = await QRCode.toBuffer(payload, {
      type: "png",
      width: 280,
      errorCorrectionLevel: "H",
      color: invert
        ? { dark: "#ffffff", light: "#000000" }
        : { dark: "#000000", light: "#ffffff" },
    });
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    fs.writeFileSync(file, buf);
  }
  return file;
}

describe("decoder integration", () => {
  it("decodes a clear generated QR with exact payload", async () => {
    const file = await ensureTempQr("SCANLY_INTEGRATION_CLEAR", "_tmp-clear.png");
    const buffer = await loadPixelBufferFromPath(file);
    const out = await decodePixelBuffer(buffer, { config: { findMultiple: false } });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.primary.payload).toBe("SCANLY_INTEGRATION_CLEAR");
      expect(["jsqr", "zxing"]).toContain(out.primary.decoder);
      expect(out.primary.preprocessing).toBeTruthy();
    }
  });

  it("decodes inverted QR via preprocess/jsQR inversion", async () => {
    const file = await ensureTempQr("SCANLY_INTEGRATION_INVERT", "_tmp-invert.png", true);
    const buffer = await loadPixelBufferFromPath(file);
    const out = await decodePixelBuffer(buffer, { config: { findMultiple: false } });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.primary.payload).toBe("SCANLY_INTEGRATION_INVERT");
    }
  });

  it("returns failure for a blank image", async () => {
    const blank = path.join(TEMP_DIR, "blank.png");
    await sharp({
      create: { width: 200, height: 200, channels: 3, background: "#808080" },
    })
      .png()
      .toFile(blank);
    const buffer = await loadPixelBufferFromPath(blank);
    const out = await decodePixelBuffer(buffer, {
      config: { findMultiple: false, maxAttempts: 40, timeoutMs: 5000 },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("no_qr_found");
  });

  it("handles corrupted file through loader", async () => {
    const bad = path.join(TEMP_DIR, "corrupt.bin");
    fs.writeFileSync(bad, Buffer.from([0, 1, 2, 3, 4]));
    await expect(loadPixelBufferFromPath(bad)).rejects.toBeTruthy();
  });

  it("decodes required canonical fixture 02", async () => {
    const file = path.join(FIXTURES, "02-clear-text.png");
    expect(fs.existsSync(file), `Missing canonical fixture: ${file}`).toBe(true);
    const buffer = await loadPixelBufferFromPath(file);
    const out = await decodePixelBuffer(buffer, { config: { findMultiple: false } });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.primary.payload).toBe("SCANLY_CLEAR_TEXT");
  });

  it("rejects empty buffer dimensions", async () => {
    const out = await decodePixelBuffer(createPixelBuffer(new Uint8ClampedArray(0), 0, 0));
    expect(out.ok).toBe(false);
  });
});
