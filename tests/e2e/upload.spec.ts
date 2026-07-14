import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(__dirname, "../..");
const fixtures = path.join(ROOT, "fixtures");

function fixture(name: string) {
  return path.join(fixtures, name);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("home page loads with Scanly branding", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Scanly|QR/i);
  await expect(page.getByRole("tab", { name: "Upload" })).toBeVisible();
});

test("upload clear QR shows payload and copy works", async ({ page, context }) => {
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
  await expect(page.getByTestId("decoded-output")).toHaveValue(/https:\/\/scanly\.example\/clear/, {
    timeout: 30_000,
  });
  await expect(page.getByTestId("open-link-button")).toBeEnabled();
});

test("invalid file shows understandable error", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  const tmp = path.join(fixtures, "_e2e-invalid.txt");
  fs.writeFileSync(tmp, "not-an-image");
  await page.getByTestId("upload-input").setInputFiles({
    name: "not-an-image.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not-an-image"),
  });
  await expect(page.getByTestId("error-message")).toBeVisible({ timeout: 15_000 });
});

test("second upload is not overwritten by first async result", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  // Start a hard image then quickly upload a clear one
  const hard = fixture("11-complex-background.jpg");
  const easy = fixture("02-clear-text.png");
  await page.getByTestId("upload-input").setInputFiles(hard);
  await page.getByTestId("upload-input").setInputFiles(easy);
  await expect(page.getByTestId("decoded-output")).toHaveValue("SCANLY_CLEAR_TEXT", {
    timeout: 45_000,
  });
});

test("inverted QR succeeds", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  const inv = fs.existsSync(fixture("27-inverted-01.png"))
    ? fixture("27-inverted-01.png")
    : fixture("15-inverted.png");
  await page.getByTestId("upload-input").setInputFiles(inv);
  await expect(page.getByTestId("decoded-output")).not.toHaveValue("", { timeout: 45_000 });
  const value = await page.getByTestId("decoded-output").inputValue();
  expect(value.length).toBeGreaterThan(0);
});

test("small QR in large image succeeds", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  const file = fs.existsSync(fixture("33-small-in-large-gen.png"))
    ? fixture("33-small-in-large-gen.png")
    : fixture("10-small-in-large.jpg");
  await page.getByTestId("upload-input").setInputFiles(file);
  await expect(page.getByTestId("decoded-output")).not.toHaveValue("", { timeout: 45_000 });
});

test("multiple-code fixture returns a defined result", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  const file = fs.existsSync(fixture("36-multiple-gen.png"))
    ? fixture("36-multiple-gen.png")
    : fixture("16-multiple-codes.jpg");
  await page.getByTestId("upload-input").setInputFiles(file);
  await expect(page.getByTestId("decoded-output")).not.toHaveValue("", { timeout: 45_000 });
  const value = await page.getByTestId("decoded-output").inputValue();
  expect(value.length).toBeGreaterThan(0);
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
  await expect(page.getByTestId("error-message")).toContainText(/permission|denied|camera/i);
});

test("no camera device state", async ({ page }) => {
  await page.addInitScript(() => {
    // Force empty device list path via zxing helper by stubbing enumerateDevices
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
