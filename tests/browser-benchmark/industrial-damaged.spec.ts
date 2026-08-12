import path from "node:path";
import { expect, test } from "@playwright/test";

test("industrial damaged input never hallucinates a payload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByRole("combobox", { name: "Format preset" }).selectOption("industrial");
  await page.getByTestId("upload-input").setInputFiles(path.resolve(__dirname, "../../fixtures/14-damaged.png"));
  await expect(page.getByTestId("processing-status")).toContainText(/Decoded|Failed to decode image/, { timeout: 100_000 });
  const value = await page.getByTestId("decoded-output").inputValue();
  expect(["", "https://scanly.example/damaged"]).toContain(value);
});
