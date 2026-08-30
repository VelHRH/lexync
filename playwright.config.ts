import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop-chromium',
      testMatch: /landing-page\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'web-authentication',
      testMatch: /web-authentication\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'web-authentication-mobile',
      testMatch: /web-authentication\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
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
    {
      name: 'extension-release',
      testMatch: /extension-release\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'pnpm --filter @lexync/web start',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
