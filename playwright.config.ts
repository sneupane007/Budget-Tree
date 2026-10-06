import { defineConfig, devices } from "@playwright/test"
import {
  APP_PORT, APP_URL, FAKE_SUPABASE_URL, FAKE_UPSTASH_URL, SERVER_ENV, authFile,
} from "./tests/helpers/env"

// The whole suite runs against an isolated stack: a private local Postgres
// (port 54329), fake Upstash + fake Supabase Storage servers, and a Next.js
// server on :3100 whose env is fully overridden — the real .env.local services
// are never reachable. One worker: specs share one DB and the caches are live.
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "tests/.report" }]],
  outputDir: "tests/.results",
  use: {
    baseURL: APP_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "api", testDir: "./tests/api" },
    {
      name: "e2e",
      testDir: "./tests/e2e",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: authFile("admin") },
    },
  ],
  webServer: [
    {
      command: "npx tsx tests/helpers/fake-services.ts",
      url: `${FAKE_UPSTASH_URL}/__health`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      // Wait on fake-supabase too by depending on the same process (same command above).
      command: `npx next dev -p ${APP_PORT}`,
      url: `${APP_URL}/home`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: SERVER_ENV as Record<string, string>,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
  metadata: { fakeSupabase: FAKE_SUPABASE_URL },
})
