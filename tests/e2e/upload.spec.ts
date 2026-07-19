import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import QRCode from "qrcode";

const ROOT = path.resolve(__dirname, "../..");
const fixtures = path.join(ROOT, "fixtures");
const alpha5Manifest = JSON.parse(fs.readFileSync(path.join(fixtures, "alpha5", "manifest.json"), "utf8")) as {
  fixtures: Array<{ id: string; file: string; expectedPayload: string; format?: string; expectedGs1?: boolean }>;
};

function fixture(name: string) {
  const file = path.join(fixtures, name);
  expect(fs.existsSync(file), `Missing canonical fixture: ${file}`).toBe(true);
  return file;
}

test.beforeEach(async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  (page as typeof page & { __scanlyPageErrors?: string[] }).__scanlyPageErrors = pageErrors;
  await page.goto("/");
});

test.afterEach(async ({ page }) => {
  expect((page as typeof page & { __scanlyPageErrors?: string[] }).__scanlyPageErrors ?? []).toEqual([]);
});

test("home page loads with Scanly branding @smoke", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Scanly/i);
  await expect(page.getByRole("tab", { name: "Upload" })).toBeVisible();
  await page.getByRole("tab", { name: "Upload" }).click();
  await expect(page.getByTestId("processing-status")).toContainText("Ready");
  await expect(page.getByTestId("upload-input")).toBeEnabled();
});

test("upload clear QR through a real worker @smoke", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByTestId("upload-input").setInputFiles(fixture("02-clear-text.png"));
  await expect(page.getByTestId("decoded-output")).toHaveValue("SCANLY_CLEAR_TEXT", {
    timeout: 30_000,
  });
  const state = await page.evaluate(() => window.__SCANLY_WORKER_DEBUG__);
  expect(state?.lastPath).toBe("worker");
  expect(state?.created).toBeGreaterThanOrEqual(1);
  expect(state?.decodePosted).toBeGreaterThanOrEqual(1);
});

test("ZXing contribution fixture uses standard WASM through the real worker @smoke", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByTestId("upload-input").setInputFiles(fixture("74-zxing-contribution-blur.png"));
  const output = page.getByTestId("decoded-output");
  await expect(output).toHaveValue("ZXING_UNIQUE_3_2_L", { timeout: 60_000 });
  await expect(output).toHaveAttribute("data-engine", "zxing-cpp-wasm");
  await expect(output).toHaveAttribute("data-engine-variant", "standard");
  const state = await page.evaluate(() => window.__SCANLY_WORKER_DEBUG__);
  expect(state?.lastPath).toBe("worker");
  expect(state?.workerDecodeCount).toBeGreaterThanOrEqual(1);
});

for (const id of ["data-matrix-01", "pdf417-01", "code-128-13", "ean-13-01", "ean-8-01", "upc-a-01", "upc-e-01"]) {
  const alpha5 = alpha5Manifest.fixtures.find((entry) => entry.id === id);
  if (!alpha5?.format) throw new Error(`Missing Alpha.5 browser fixture '${id}'.`);
  const { format, expectedPayload, file } = alpha5;
  test(`upload ${format} through the real multi-format worker @smoke`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.getByRole("tab", { name: "Upload" }).click();
    await page.getByRole("combobox", { name: "Format preset" }).selectOption("multiformat-balanced");
    await page.getByTestId("upload-input").setInputFiles(path.join(ROOT, file));
    const output = page.getByTestId("decoded-output");
    await expect(output).toHaveValue(expectedPayload, { timeout: 75_000 });
    await expect(output).toHaveAttribute("data-format", format);
    await expect(output).toHaveAttribute("data-engine", "zxing-cpp-wasm");
    await expect(page.getByTestId("format-badge")).toBeVisible();
    await expect(page.getByTestId("raw-bytes")).toBeAttached();
    if (alpha5.expectedGs1) await expect(page.getByTestId("gs1-indicator")).toBeVisible();
    if (["ean_13", "ean_8", "upc_a", "upc_e"].includes(format)) {
      await expect(page.getByTestId("checksum-status")).toContainText("valid");
    }
    const state = await page.evaluate(() => window.__SCANLY_WORKER_DEBUG__);
    expect(state?.lastPath).toBe("worker");
    expect(state?.workerDecodeCount).toBeGreaterThanOrEqual(1);
  });
}

test("upload clear QR shows exact payload and copy works", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByTestId("upload-input").setInputFiles(fixture("02-clear-text.png"));
  await expect(page.getByTestId("decoded-output")).toHaveValue("SCANLY_CLEAR_TEXT", {
    timeout: 30_000,
  });
  await page.getByTestId("copy-button").click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toBe("SCANLY_CLEAR_TEXT");
});

test("URL result shows Open Link", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByTestId("upload-input").setInputFiles(fixture("01-clear-url.png"));
  await expect(page.getByTestId("decoded-output")).toHaveValue("https://scanly.example/clear", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("open-link-button")).toBeEnabled();
});

test("invalid file shows understandable error", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByTestId("upload-input").setInputFiles({
    name: "not-an-image.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not-an-image"),
  });
  await expect(page.getByTestId("error-message")).toBeVisible({ timeout: 15_000 });
});

test("second upload is not overwritten by first async result", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  await expect(page.getByTestId("upload-input")).toBeEnabled();
  await page.getByTestId("upload-input").setInputFiles(fixture("14-damaged.png"));
  await page.getByTestId("upload-input").setInputFiles(fixture("02-clear-text.png"));
  try {
    await expect(page.getByTestId("decoded-output")).toHaveValue("SCANLY_CLEAR_TEXT", {
      timeout: 45_000,
    });
  } catch (error) {
    console.log("superseded-upload diagnostics", await page.evaluate(() => ({
      worker: window.__SCANLY_WORKER_DEBUG__,
      status: document.querySelector<HTMLElement>("[data-testid='processing-status']")?.innerText,
      errorCode: document.querySelector<HTMLElement>("[data-testid='error-reason']")?.innerText,
      errorMessage: document.querySelector<HTMLElement>("[data-testid='error-message']")?.innerText,
    })));
    throw error;
  }
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId("decoded-output")).toHaveValue("SCANLY_CLEAR_TEXT");
  await expect(page.getByTestId("error-message")).toHaveCount(0);
});

test("inverted QR decodes exact payload @smoke", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  const inv = fixture("27-inverted-01.png");
  const expected = "SCANLY_INVERTED_01";
  await page.getByTestId("upload-input").setInputFiles(inv);
  await expect(page.getByTestId("decoded-output")).toHaveValue(expected, { timeout: 45_000 });
});

test("small QR in large image decodes exact payload", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  const file = fixture("33-small-in-large-gen.png");
  const expected = "SCANLY_SMALL_01";
  await page.getByTestId("upload-input").setInputFiles(file);
  await expect(page.getByTestId("decoded-output")).toHaveValue(expected, { timeout: 45_000 });
});

test("dual multiple-code fixture returns complete payload set and independent copy controls", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("tab", { name: "Upload" }).click();
  const file = fixture("36-multiple-gen.png");
  await page.getByTestId("upload-input").setInputFiles(file);
  await expect(page.getByTestId("multi-results")).toBeVisible({ timeout: 60_000 });

  const payloads = await page.getByTestId("decoded-result-item").evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-payload"))
  );
  const expected = ["SCANLY_MULTI_PRIMARY", "SCANLY_MULTI_SECONDARY"];
  for (const p of expected) {
    expect(payloads).toContain(p);
    const item = page.getByTestId("decoded-result-item").filter({ hasText: p });
    await item.getByTestId("result-copy-button").click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(p);
    await expect(item.getByTestId("result-open-link-button")).toHaveCount(0);
  }
  await expect(page.getByTestId("decoded-output")).toHaveValue(payloads[0] ?? "");
});

test("multiple URL results expose Open Link only on URL items", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByTestId("upload-input").setInputFiles(fixture("16-multiple-codes.jpg"));
  await expect(page.getByTestId("multi-results")).toBeVisible({ timeout: 60_000 });
  for (const payload of ["https://scanly.example/primary", "https://scanly.example/secondary"]) {
    const item = page.getByTestId("decoded-result-item").filter({ hasText: payload });
    await expect(item).toHaveCount(1);
    await expect(item.getByTestId("result-open-link-button")).toHaveCount(1);
  }
});

test("three-code fixture returns complete payload set @smoke", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByTestId("upload-input").setInputFiles(fixture("50-multiple-three.png"));
  await expect(page.getByTestId("multi-results")).toBeVisible({ timeout: 60_000 });
  const payloads = await page.getByTestId("decoded-result-item").evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-payload"))
  );
  for (const p of ["SCANLY_TRI_A", "SCANLY_TRI_B", "SCANLY_TRI_C"]) {
    expect(payloads).toContain(p);
  }
  await expect(page.getByTestId("decoded-output")).toHaveValue(payloads[0] ?? "");
});

test("eight-code fixture is complete and ordered through the real Worker @smoke", async ({ page }) => {
  test.setTimeout(90_000);
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByTestId("upload-input").setInputFiles(fixture("65-multiple-eight.png"));
  await expect(page.getByTestId("decoded-result-item")).toHaveCount(8, { timeout: 80_000 });
  const payloads = await page.getByTestId("decoded-result-item").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-payload")));
  expect(payloads).toEqual(Array.from({ length: 8 }, (_, index) => `SCANLY_MULTI8_${String(index + 1).padStart(2, "0")}`));
  const state = await page.evaluate(() => window.__SCANLY_WORKER_DEBUG__);
  expect(state?.lastPath).toBe("worker");
});

test("in-flight cancel on hard fixture responds within 2 seconds @smoke", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByTestId("upload-input").setInputFiles(fixture("14-damaged.png"));
  await expect(page.getByTestId("processing-status")).toContainText(
    /Routing|Detecting|Decoding|Trying|Backup/,
    { timeout: 10_000 }
  );
  const cancelStarted = Date.now();
  await page.getByTestId("cancel-button").click();
  await expect(page.getByTestId("processing-status")).toContainText("Cancelled", { timeout: 2_000 });
  const cancellationLatencyMs = Date.now() - cancelStarted;
  console.log(`cancellation latency: ${cancellationLatencyMs}ms`);
  expect(cancellationLatencyMs).toBeLessThanOrEqual(2_000);
  await expect(page.getByRole("tab", { name: "Camera" })).toBeEnabled();
  await expect(page.getByTestId("upload-input")).toBeEnabled();
  await page.getByRole("tab", { name: "Camera" }).click();
  await page.getByRole("tab", { name: "Upload" }).click();
  await expect(page.getByTestId("upload-input")).toBeEnabled();
});

test("upload after cancellation decodes clear fixture exactly @smoke", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByTestId("upload-input").setInputFiles(fixture("14-damaged.png"));
  await expect(page.getByTestId("processing-status")).toContainText(
    /Routing|Detecting|Decoding|Trying|Backup/,
    { timeout: 10_000 }
  );
  await page.getByTestId("cancel-button").click();
  await expect(page.getByTestId("processing-status")).toContainText("Cancelled", { timeout: 2_000 });
  await page.getByTestId("upload-input").setInputFiles(fixture("02-clear-text.png"));
  await expect(page.getByTestId("decoded-output")).toHaveValue("SCANLY_CLEAR_TEXT", { timeout: 30_000 });
});

test("reset clears upload result", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByTestId("upload-input").setInputFiles(fixture("02-clear-text.png"));
  await expect(page.getByTestId("decoded-output")).toHaveValue("SCANLY_CLEAR_TEXT", { timeout: 30_000 });
  await page.getByRole("button", { name: "Reset upload result" }).click();
  await expect(page.getByTestId("decoded-output")).toHaveValue("");
  await expect(page.getByTestId("processing-status")).toContainText("Ready");
});

test("tab switch stops upload processing state", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByTestId("upload-input").setInputFiles(fixture("14-damaged.png"));
  await page.getByRole("tab", { name: "Camera" }).click();
  await page.getByRole("tab", { name: "Upload" }).click();
  await expect(page.getByTestId("cancel-button")).toBeDisabled();
});

test("camera permission denied is surfaced", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      get() {
        return {
          enumerateDevices: async () => [],
          getUserMedia: async () => {
            const err = new Error("Permission denied");
            err.name = "NotAllowedError";
            throw err;
          },
        };
      },
    });
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "Camera" }).click();
  await page.getByRole("button", { name: "Start camera scan" }).click();
  await expect(page.getByTestId("error-message")).toBeVisible({ timeout: 10_000 });
});

test("no camera device state", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      get() {
        return {
          enumerateDevices: async () => [],
          getUserMedia: async () => {
            const err = new Error("Requested device not found");
            err.name = "NotFoundError";
            throw err;
          },
        };
      },
    });
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "Camera" }).click();
  await page.getByRole("button", { name: "Start camera scan" }).click();
  await expect(page.getByTestId("error-message")).toBeVisible({ timeout: 10_000 });
});

test("unsafe URL schemes and plain text never enable Open Link", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  for (const payload of ["javascript:alert(1)", "data:text/html,<h1>x</h1>", "ordinary text"]) {
    const png = await QRCode.toBuffer(payload, { type: "png", width: 280 });
    await page.getByTestId("upload-input").setInputFiles({
      name: "protocol-test.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(page.getByTestId("decoded-output")).toHaveValue(payload, { timeout: 30_000 });
    await expect(page.getByTestId("open-link-button")).toBeDisabled();
  }
});

test("HTTP and HTTPS payloads enable Open Link", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  for (const payload of ["http://scanly.example/http", "https://scanly.example/https"]) {
    const png = await QRCode.toBuffer(payload, { type: "png", width: 280 });
    await page.getByTestId("upload-input").setInputFiles({
      name: "safe-url.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(page.getByTestId("decoded-output")).toHaveValue(payload, { timeout: 30_000 });
    await expect(page.getByTestId("open-link-button")).toBeEnabled();
  }
});

test("oversized upload fails early with a clear reason", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByTestId("upload-input").setInputFiles({
    name: "oversized.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(25 * 1024 * 1024 + 1),
  });
  await expect(page.getByTestId("error-message")).toHaveAttribute(
    "data-error-reason",
    "resource_limit_exceeded"
  );
  await expect(page.getByTestId("error-message")).toContainText("25 MiB");
});

test("ten cancel cycles leave the next worker decode healthy", async ({ page }) => {
  test.setTimeout(120_000);
  await page.getByRole("tab", { name: "Upload" }).click();
  for (let i = 0; i < 10; i += 1) {
    await page.getByTestId("upload-input").setInputFiles([]);
    await page.getByTestId("upload-input").setInputFiles(fixture("14-damaged.png"));
    await expect(page.getByTestId("processing-status")).toContainText(
      /Routing|Detecting|Decoding|Trying|Backup/,
      { timeout: 10_000 }
    );
    await page.getByTestId("cancel-button").click();
    await expect(page.getByTestId("processing-status")).toContainText("Cancelled");
  }
  await page.getByTestId("upload-input").setInputFiles(fixture("02-clear-text.png"));
  await expect(page.getByTestId("decoded-output")).toHaveValue("SCANLY_CLEAR_TEXT", {
    timeout: 30_000,
  });
  const state = await page.evaluate(() => window.__SCANLY_WORKER_DEBUG__);
  expect(state?.terminated).toBeGreaterThanOrEqual(10);
});
