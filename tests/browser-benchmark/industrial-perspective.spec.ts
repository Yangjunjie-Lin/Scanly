import path from "node:path";
import { expect, test } from "@playwright/test";

test("industrial perspective recovery", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByRole("combobox", { name: "Format preset" }).selectOption("industrial");
  await page.getByTestId("upload-input").setInputFiles(path.resolve(__dirname, "../../fixtures/13-perspective.jpg"));
  await expect(page.getByTestId("processing-status")).toContainText("Decoded", { timeout: 100_000 });
  await expect(page.getByTestId("decoded-output")).toHaveValue("https://scanly.example/perspective");
});
