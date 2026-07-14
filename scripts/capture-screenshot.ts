import { chromium } from "@playwright/test";
import path from "node:path";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await page.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByTestId("upload-input").setInputFiles(path.resolve("fixtures/02-clear-text.png"));
  await page.getByTestId("decoded-output").waitFor({ state: "visible" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "docs/screenshot.png", fullPage: true });
  await browser.close();
  console.log("Wrote docs/screenshot.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
