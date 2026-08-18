import { expect, test } from "@playwright/test";

test("browser realtime smoke runs the deterministic ScannerSession simulator in every browser", async ({ page }) => {
  await page.goto("/scanner-runtime-test");
  const report = page.getByTestId("scanner-runtime-report");
  await expect(report).not.toHaveText("running", { timeout: 30_000 });
  const statistics = JSON.parse(await report.innerText()) as { confirmedEvents: number; emittedEvents: number; staleEvents: number; pendingFrameCount: number; activeDecodeCount: number; finalControlledMemory: number };
  expect(statistics.confirmedEvents).toBeGreaterThan(0);
  expect(statistics.emittedEvents).toBe(1);
  expect(statistics.staleEvents).toBe(0);
  expect(statistics.pendingFrameCount).toBe(0);
  expect(statistics.activeDecodeCount).toBe(0);
  expect(statistics.finalControlledMemory).toBe(0);
});
