import { expect, type Page } from "@playwright/test";

export async function loadScannerRuntimeReport<T>(page: Page, scenario: string): Promise<T> {
  await page.goto(`/scanner-runtime-test?scenario=${scenario}`);
  const report = page.getByTestId("scanner-runtime-report");
  await expect(report).not.toHaveText("running", { timeout: 30_000 });
  const parsed = JSON.parse(await report.innerText()) as T & { error?: string };
  if (parsed.error) throw new Error(`Browser ScannerSession ${scenario} scenario failed: ${parsed.error}`);
  return parsed;
}
