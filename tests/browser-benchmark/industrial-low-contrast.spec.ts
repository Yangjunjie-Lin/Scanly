import path from "node:path";
import { expect, test } from "@playwright/test";

test("industrial low contrast recovery", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByRole("combobox", { name: "Format preset" }).selectOption("industrial");
  await page.getByTestId("upload-input").setInputFiles(path.resolve(__dirname, "../../fixtures/05-low-contrast.png"));
  await expect(page.getByTestId("processing-status")).toContainText("Decoded", { timeout: 100_000 });
  await expect(page.getByTestId("decoded-output")).toHaveValue("https://scanly.example/low-contrast");
});
