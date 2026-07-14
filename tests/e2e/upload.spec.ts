import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(__dirname, "../..");
const fixtures = path.join(ROOT, "fixtures");

function fixture(name: string) {
  return path.join(fixtures, name);
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

test("home page loads with Scanly branding", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Scanly/i);
  await expect(page.getByRole("tab", { name: "Upload" })).toBeVisible();
  await page.getByRole("tab", { name: "Upload" }).click();
  await expect(page.getByTestId("processing-status")).toContainText("Ready");
  await expect(page.getByTestId("upload-input")).toBeEnabled();
});

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
  await page.getByTestId("upload-input").setInputFiles(fixture("14-damaged.png"));
  await page.getByTestId("upload-input").setInputFiles(fixture("02-clear-text.png"));
  await expect(page.getByTestId("decoded-output")).toHaveValue("SCANLY_CLEAR_TEXT", {
    timeout: 45_000,
  });
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId("decoded-output")).toHaveValue("SCANLY_CLEAR_TEXT");
  await expect(page.getByTestId("error-message")).toHaveCount(0);
});

test("inverted QR decodes exact payload", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  const inv = fs.existsSync(fixture("27-inverted-01.png"))
    ? fixture("27-inverted-01.png")
    : fixture("15-inverted.png");
  const expected = inv.includes("27-inverted") ? "SCANLY_INVERTED_01" : "https://scanly.example/inverted";
  await page.getByTestId("upload-input").setInputFiles(inv);
  await expect(page.getByTestId("decoded-output")).toHaveValue(expected, { timeout: 45_000 });
});

test("small QR in large image decodes exact payload", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  const file = fs.existsSync(fixture("33-small-in-large-gen.png"))
    ? fixture("33-small-in-large-gen.png")
    : fixture("10-small-in-large.jpg");
  const expected = file.includes("33-small") ? "SCANLY_SMALL_01" : "https://scanly.example/small";
  await page.getByTestId("upload-input").setInputFiles(file);
  await expect(page.getByTestId("decoded-output")).toHaveValue(expected, { timeout: 45_000 });
});

test("dual multiple-code fixture returns complete payload set and independent copy controls", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("tab", { name: "Upload" }).click();
  const file = fs.existsSync(fixture("36-multiple-gen.png"))
    ? fixture("36-multiple-gen.png")
    : fixture("16-multiple-codes.jpg");
  await page.getByTestId("upload-input").setInputFiles(file);
  await expect(page.getByTestId("multi-results")).toBeVisible({ timeout: 60_000 });

  const payloads = await page.getByTestId("decoded-result-item").evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-payload"))
  );
  const expected = file.includes("36-multiple")
    ? ["SCANLY_MULTI_PRIMARY", "SCANLY_MULTI_SECONDARY"]
    : ["https://scanly.example/primary", "https://scanly.example/secondary"];
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

test("three-code fixture returns complete payload set", async ({ page }) => {
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

test("in-flight cancel on hard fixture responds within 2 seconds", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByTestId("upload-input").setInputFiles(fixture("14-damaged.png"));
  await expect(page.getByTestId("processing-status")).toContainText(
    /Detecting|Decoding|Trying|Backup/,
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

test("upload after cancellation decodes clear fixture exactly", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByTestId("upload-input").setInputFiles(fixture("14-damaged.png"));
  await expect(page.getByTestId("processing-status")).toContainText(
    /Detecting|Decoding|Trying|Backup/,
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
