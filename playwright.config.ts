import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop-chromium',
      testMatch: /landing-page\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      testMatch: /landing-page\.mobile\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'extension-chromium',
      testMatch: /extension\/.*\.spec\.ts/,
    },
    {
      name: 'bundle-security',
      testMatch: /security\/.*\.spec\.ts/,
    },
    {
      name: 'domain-contract',
      testMatch: /domain\/.*\.spec\.ts/,
    },
    {
      name: 'brand-assets',
      testMatch: /brand-assets\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'pnpm --filter @lexync/web start',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
