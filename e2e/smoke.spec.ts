import { expect, test } from './support/helpers';

/**
 * 雛形。各機能の E2E（Login / Event 確認 / 出欠登録・変更 / admin の Event 作成 / Member 招待）は
 * e2e/<feature>.spec.ts に追加する。
 */
test('API が Vite proxy 経由で応答する', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toEqual({ ok: true });
});

test('未ログインで保存済み circleLoginId が無ければ案内画面を表示する', async ({ page }) => {
  await page.goto('/events');
  await expect(page.getByText('ログインURLを確認してください')).toBeVisible();
  // 横スクロールが発生しない（guardrails §12）
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
