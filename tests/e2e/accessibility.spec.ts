import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

function fixture(name: string): string {
  const file = path.join(ROOT, "fixtures", name);
  expect(fs.existsSync(file), `Missing canonical fixture: ${file}`).toBe(true);
  return file;
}

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("initial page has no automated accessibility violations", async ({ page }) => {
  await expectNoA11yViolations(page);
});

test("upload mode has no automated accessibility violations", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  await expectNoA11yViolations(page);
});

test("decoded result has no automated accessibility violations", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByTestId("upload-input").setInputFiles(fixture("02-clear-text.png"));
  await expect(page.getByTestId("decoded-output")).toHaveValue("SCANLY_CLEAR_TEXT", {
    timeout: 30_000,
  });
  await expectNoA11yViolations(page);
});

test("multiple results have no automated accessibility violations", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByTestId("upload-input").setInputFiles(fixture("36-multiple-gen.png"));
  await expect(page.getByTestId("multi-results")).toBeVisible({ timeout: 60_000 });
  await expectNoA11yViolations(page);
});

test("error state has no automated accessibility violations", async ({ page }) => {
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByTestId("upload-input").setInputFiles({
    name: "not-an-image.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not-an-image"),
  });
  await expect(page.getByTestId("error-message")).toBeVisible();
  await expectNoA11yViolations(page);
});
