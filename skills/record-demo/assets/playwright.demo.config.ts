import {defineConfig} from "@playwright/test";

// Recording config for the demo shots in demos/shots/. Kept apart from the project's own test config
// so ordinary test runs never pick the shots up, and so a shot gets as long as it needs.
//
//   npx playwright test -c demos/playwright.demo.config.ts portfolio/01-intro
export default defineConfig({
  testDir: "shots",
  testMatch: "**/*.spec.ts",
  outputDir: "../artifacts/demo-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Generous: a person may be solving a captcha mid-shot. Each spec can set its own.
  timeout: 300_000,
  reporter: "line",
});
