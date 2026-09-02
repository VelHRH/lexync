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
      name: 'web-learning-languages',
      testMatch: /web-learning-languages\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'web-learning-languages-mobile',
      testMatch: /web-learning-languages\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'web-multilingual-capture',
      testMatch: /web-multilingual-capture\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'web-multilingual-capture-mobile',
      testMatch: /web-multilingual-capture\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'web-vocabulary',
      testMatch: /web-vocabulary-entry\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'web-vocabulary-mobile',
      testMatch: /web-vocabulary-entry\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'web-scheduled-recognition',
      testMatch: /web-scheduled-recognition\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'web-scheduled-recognition-mobile',
      testMatch: /web-scheduled-recognition\.spec\.ts/,
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
      testIgnore: /extension\/study-pair-expression-identity\.spec\.ts/,
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
