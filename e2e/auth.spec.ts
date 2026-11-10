import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { expect, test } from './support/helpers';

/**
 * Login / Logout（AC-01, AC-20 の Login 部分）。
 * ローカル D1 に seed CLI（apps/api/scripts/seed.ts）で一意な Circle と admin を作ってから操作する。
 * 事前に `npm run db:migrate:local` を済ませておくこと。
 */
const circleLoginId = `e2e-${Date.now()}-${randomBytes(3).toString('hex')}`;
const email = 'e2e-admin@example.com';
const password = randomBytes(12).toString('base64url');

test.beforeAll(() => {
  execFileSync(
    'node',
    ['scripts/seed.ts', '--circle-login-id', circleLoginId, '--circle-name', 'E2Eサークル', '--email', email, '--name', 'E2E管理者'],
    { cwd: path.resolve(import.meta.dirname, '../apps/api'), input: `${password}\n`, stdio: ['pipe', 'ignore', 'inherit'] },
  );
});

test('ログインしてイベント一覧へ遷移し、ログアウトでログイン画面へ戻る', async ({ page }) => {
  await page.goto(`/login/${circleLoginId}`);
  await expect(page.getByRole('heading', { name: 'ログイン' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('パスワード').fill(password);
  await page.getByRole('button', { name: 'ログイン' }).click();

  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByText('E2Eサークル')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

  await page.getByRole('button', { name: 'メニュー' }).click();
  await page.getByRole('button', { name: 'ログアウト' }).click();
  await expect(page).toHaveURL(new RegExp(`/login/${circleLoginId}$`));
  // Session はサーバー側で無効化されている
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
});

test('パスワード違いは統一文言を表示する', async ({ page }) => {
  await page.goto(`/login/${circleLoginId}`);
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('パスワード').fill('wrong-password');
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page.getByRole('alert')).toHaveText('メールアドレスまたはパスワードが違います');
  await expect(page).toHaveURL(new RegExp(`/login/${circleLoginId}$`));
});
