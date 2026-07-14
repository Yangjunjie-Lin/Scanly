import { describe, expect, it } from "vitest";
import { decodePixelBuffer } from "../../lib/qr/decode-pipeline";
import { loadPixelBufferFromPath } from "../../lib/qr/image-loader-node";
import { createPixelBuffer } from "../../lib/qr/grayscale";
import fs from "node:fs";
import path from "node:path";

const FIXTURES = path.resolve(__dirname, "../../fixtures");

describe("cancellation contract", () => {
  it("returns cancelled when aborted before start", async () => {
    const controller = new AbortController();
    controller.abort();
    const buf = createPixelBuffer(new Uint8ClampedArray(64), 4, 4);
    const out = await decodePixelBuffer(buf, { signal: controller.signal });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("cancelled");
      expect(out.cancelled).toBe(true);
    }
  });

  it("returns cancelled when aborted mid-decode", async () => {
    const file = path.join(FIXTURES, "14-damaged.png");
    expect(fs.existsSync(file), `Missing canonical fixture: ${file}`).toBe(true);
    const buffer = await loadPixelBufferFromPath(file);
    const controller = new AbortController();
    const promise = decodePixelBuffer(buffer, {
      signal: controller.signal,
      config: {
        findMultiple: false,
        maxAttempts: 200,
        failFastAfterAttempts: 999,
        timeoutMs: 60_000,
      },
    });
    let cancelRequestedAt = 0;
    setTimeout(() => {
      cancelRequestedAt = Date.now();
      controller.abort();
    }, 50);
    const out = await promise;
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("cancelled");
      expect(out.cancelled).toBe(true);
      expect(Date.now() - cancelRequestedAt).toBeLessThan(2_000);
    }

    const clear = await loadPixelBufferFromPath(path.join(FIXTURES, "02-clear-text.png"));
    const next = await decodePixelBuffer(clear, { config: { findMultiple: false } });
    expect(next.ok && next.primary.payload).toBe("SCANLY_CLEAR_TEXT");
  });

  it("distinguishes timeout from cancelled", async () => {
    const noisy = createPixelBuffer(new Uint8ClampedArray(400 * 400 * 4), 400, 400);
    const out = await decodePixelBuffer(noisy, {
      config: { timeoutMs: 1, maxAttempts: 500, findMultiple: false },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("timeout");
      expect(out.cancelled).toBe(false);
      expect(out.message).toMatch(/cropping closer/i);
      expect(out.message).toMatch(/clearer image/i);
      expect(out.message).toMatch(/reducing image size/i);
    }
  });

  it("multiple fixture returns all required payloads", async () => {
    const file = path.join(FIXTURES, "36-multiple-gen.png");
    expect(fs.existsSync(file), `Missing canonical fixture: ${file}`).toBe(true);
    const buffer = await loadPixelBufferFromPath(file);
    const out = await decodePixelBuffer(buffer, {
      config: {
        findMultiple: true,
        requiredPayloads: ["SCANLY_MULTI_PRIMARY", "SCANLY_MULTI_SECONDARY"],
        expectedResultCount: 2,
      },
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      const payloads = out.results.map((r) => r.payload);
      expect(payloads).toContain("SCANLY_MULTI_PRIMARY");
      expect(payloads).toContain("SCANLY_MULTI_SECONDARY");
    }
  });

  it("emits monotonic attempt progress after the detection stage", async () => {
    const buffer = await loadPixelBufferFromPath(path.join(FIXTURES, "02-clear-text.png"));
    const events: string[] = [];
    const progress: number[] = [];
    const out = await decodePixelBuffer(buffer, {
      config: { findMultiple: false },
      onStage: (stage) => events.push(stage),
      onProgress: ({ attemptCount }) => progress.push(attemptCount),
    });
    expect(out.ok).toBe(true);
    expect(events[0]).toContain("Detecting candidate regions");
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(progress.at(-1)).toBe(out.attemptCount);
  });

  it("honors production maxMultipleResults without known fixture payloads", async () => {
    const buffer = await loadPixelBufferFromPath(path.join(FIXTURES, "50-multiple-three.png"));
    const out = await decodePixelBuffer(buffer, {
      config: { findMultiple: true, maxMultipleResults: 2 },
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.results).toHaveLength(2);
  });
});
