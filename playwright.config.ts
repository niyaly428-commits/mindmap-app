import { defineConfig } from '@playwright/test';

const PORT = 5188;
/** Set E2E_BASE_URL to test a deployed site instead of the local dev server. */
const remote = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    baseURL: remote ?? `http://localhost:${PORT}`,
    // Uses the Microsoft Edge installed on Windows (no browser download needed).
    channel: 'msedge',
    viewport: { width: 1400, height: 900 },
  },
  webServer: remote
    ? undefined
    : {
        command: `npx vite --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: true,
      },
});
