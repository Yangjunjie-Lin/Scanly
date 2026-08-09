import { defineConfig, devices } from "@playwright/test";

const benchmarkPort = 3211;
const benchmarkBaseUrl = `http://127.0.0.1:${benchmarkPort}`;

export default defineConfig({
  testDir: "tests/browser-benchmark",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: benchmarkBaseUrl, trace: "retain-on-failure" },
  webServer: {
    command: `npm run start -- --port ${benchmarkPort}`,
    url: benchmarkBaseUrl,
    // Never accept an arbitrary process that happens to answer on this port.
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
