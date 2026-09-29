import { defineConfig } from '@playwright/test';

const PORT = 5188;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Uses the Microsoft Edge installed on Windows (no browser download needed).
    channel: 'msedge',
    viewport: { width: 1400, height: 900 },
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
  },
});
