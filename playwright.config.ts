import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const useProductionServer = isCI || process.env.PLAYWRIGHT_PRODUCTION === "1";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["line"]],
  use: {
    baseURL: "http://127.0.0.1:3210",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: useProductionServer
      ? "npm run start -- --hostname 127.0.0.1 --port 3210"
      : "npm run dev -- --hostname 127.0.0.1 --port 3210",
    url: "http://127.0.0.1:3210/api/health",
    reuseExistingServer: !useProductionServer,
    timeout: 120_000,
  },
});
