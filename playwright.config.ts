import { defineConfig, devices } from '@playwright/test';

/**
 * E2E（guardrails §11）。`npm run test:e2e` で実行する（npm test には含めない）。
 * 初回は `npx playwright install chromium webkit` でブラウザを入れる。
 * webServer として `npm run dev`（api + web）を起動する。ローカル D1 には事前に Migration を適用しておくこと。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    // スマートフォン（AC-20）を主対象にする
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/api/health',
    // npm run test:e2e（e2e/run-local.mjs）がポートの空きを確認してから dev を起動するので、その dev を使う（CI でも同じ）
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
