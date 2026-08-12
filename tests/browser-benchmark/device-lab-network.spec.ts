import { expect, test } from "@playwright/test";

test("Device Lab loads only same-origin resources and does not claim physical evidence", async ({ page }) => {
  const origins = new Set<string>();
  page.on("request", (request) => origins.add(new URL(request.url()).origin));
  await page.goto("/device-lab");
  await expect(page.getByRole("heading", { name: "Scanly Device Lab" })).toBeVisible();
  await expect(page.getByText("Dedicated physical-camera validation harness.")).toBeVisible();
  expect([...origins]).toEqual([new URL(page.url()).origin]);
  await expect(page.getByRole("button", { name: "Export review-required draft" })).toBeVisible();
  await expect(page.getByText("Observed external resource requests during session").locator(".."))
    .toContainText("none observed");
});

test("an already-loaded ScannerSession continues without a network decode service", async ({ page, context }) => {
  await page.goto("/scanner-runtime-test?scenario=offline");
  await context.setOffline(true);
  const report = page.getByTestId("scanner-runtime-report");
  await expect(report).not.toHaveText("running", { timeout: 30_000 });
  const result = JSON.parse(await report.innerText()) as { scenario: string; networkOfflineDuringScan: boolean; remoteDecodeRequests: number; emittedEvents: number; staleEvents: number; finalControlledMemory: number };
  expect(result).toMatchObject({ scenario: "offline", networkOfflineDuringScan: true, remoteDecodeRequests: 0, emittedEvents: 1, staleEvents: 0, finalControlledMemory: 0 });
});
