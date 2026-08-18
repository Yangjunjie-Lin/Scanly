import { defineConfig, devices } from "@playwright/test";

const e2ePort = 3210;
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  // Each project launches CPU-heavy barcode decoding in an isolated browser.
  // Serial execution keeps scenario deadlines representative of one consumer
  // instead of making them depend on cross-browser CI CPU contention.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npm run start -- --port ${e2ePort}`,
    url: e2eBaseUrl,
    // A healthy but unrelated app on the same port must never satisfy the
    // evidence harness. Always launch the exact Scanly build under test.
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      grep: /@smoke/,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      grep: /@smoke/,
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
