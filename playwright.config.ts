import { defineConfig, devices } from "@playwright/test";

// `localhost`, not `127.0.0.1`: Next 16's dev server rejects requests whose Host
// is not an allowed dev origin with a 403, which starves the page of its chunks.
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

// One config, two modes, switched by COVERAGE_MODE (see `e2e/helpers.ts`, which
// re-exports the flag for the specs):
//
// - `dev`  — `bun run coverage:dev`, the instrumented Turbopack dev server.
// - `prod` — `bun run coverage`, `next start` over the instrumented production
//   build that the script has already produced. Nothing here builds; a stale or
//   uninstrumented `.next` is the caller's problem.
const PROD = process.env.COVERAGE_MODE === "prod";

export default defineConfig({
  forbidOnly: !!process.env.CI,
  fullyParallel: false,
  projects: [
    {
      name: "chromium",
      teardown: "coverage-guard",
      use: { ...devices["Desktop Chrome"] },
    },
    { name: "coverage-guard", testMatch: /coverage-guard\.teardown\.ts/ },
  ],
  reporter: [["list"]],
  retries: 0,
  testDir: "./e2e",
  // Turbopack compiles routes lazily, so in dev the first visit to each demo
  // pays a full server + client compile.
  timeout: 60_000,
  use: { baseURL: BASE_URL, trace: "off" },
  webServer: {
    command: PROD
      ? `next start --port ${PORT}`
      : `next dev --turbopack --port ${PORT}`,
    // Arms the SWC instrumentation (dev) and opens `/api/coverage` (both).
    env: { COVERAGE: "1" },
    // Never reuse: a server left running in the other mode would silently
    // answer the whole suite, and the report would describe the wrong build.
    reuseExistingServer: false,
    stdout: "pipe",
    timeout: 300_000,
    url: BASE_URL,
  },
  // Server coverage is process-global shared state, and parallel workers would
  // also trigger a dev-server compile storm.
  workers: 1,
});
