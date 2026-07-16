import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser-benchmark",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  webServer: { command: "npm run start", url: "http://127.0.0.1:3000", reuseExistingServer: !process.env.CI, timeout: 120_000 },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
