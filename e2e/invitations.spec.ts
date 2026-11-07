import { expect, test } from '@playwright/test';
import {
  BASE_URL,
  expectNoHorizontalScroll,
  invitationPath,
  loginViaUi,
  newPassword,
  readInvitationUrl,
  seedCircle,
  uniqueSuffix,
  type SeededCircle,
} from './support/helpers';

/**
 * Member 招待（guardrails §11）。AC-13 / AC-15 / AC-20。
 * admin がメンバー一覧から招待 → 招待 URL（dev ログ: decisions C7）で初回登録 → イベント一覧（C9）。
 */
let circle: SeededCircle;

test.beforeAll(() => {
  circle = seedCircle('招待テストサークル');
});

test('admin が招待し、招待 URL から初回登録するとイベント一覧へ進む（AC-13 / AC-15）', async ({ page, browser }) => {
  const email = `invitee-${uniqueSuffix()}@example.com`;
  const displayName = `新メンバー${uniqueSuffix().slice(-4)}`;
  const password = newPassword();

  // admin: メンバー一覧から招待する
  await loginViaUi(page, circle.admin);
  await page.getByRole('link', { name: /メンバー/ }).click();
  await expect(page).toHaveURL(/\/members$/);
  await expect(page.getByRole('heading', { name: 'メンバー一覧' })).toBeVisible();
  await expectNoHorizontalScroll(page, 'メンバー一覧');

  const created = page.waitForResponse(
    (res) => res.url().endsWith('/api/invitations') && res.request().method() === 'POST',
  );
  await page.getByLabel('招待するメールアドレス').fill(email);
  await page.getByRole('button', { name: '招待する' }).click();
  const createdRes = await created;
  expect(createdRes.status()).toBe(201);
  const { invitation } = await createdRes.json();

  await expect(page.getByRole('status')).toHaveText(`${email} に招待メールを送信しました`);
  // 招待状態を確認できる
  const pending = page.getByRole('list', { name: '招待中の一覧' }).getByRole('listitem').filter({ hasText: email });
  await expect(pending).toContainText('招待中');
  await expectNoHorizontalScroll(page, 'メンバー一覧（招待後）');

  // 招待された人: 招待 URL を開いて初回登録する（未ログインの別ブラウザ）
  const path = invitationPath(await readInvitationUrl(invitation.id));
  const inviteeContext = await browser.newContext({ baseURL: BASE_URL });
  const invitee = await inviteeContext.newPage();
  await invitee.goto(path);
  await expect(invitee.getByRole('heading', { name: '初回登録' })).toBeVisible();
  await expect(invitee.getByText('招待テストサークル')).toBeVisible();
  await expect(invitee.getByLabel('招待先メールアドレス')).toHaveText(email);
  await expectNoHorizontalScroll(invitee, '初回登録');

  await invitee.getByLabel('表示名').fill(displayName);
  await invitee.getByLabel('パスワード', { exact: true }).fill(password);
  await invitee.getByLabel('パスワード（確認）').fill(password);
  await invitee.getByRole('button', { name: '登録する' }).click();

  // Session が発行され、イベント一覧へ（C9）
  await expect(invitee).toHaveURL(/\/events$/);
  await expect(invitee.getByRole('heading', { name: 'イベント一覧' })).toBeVisible();
  await expect(invitee.getByText('招待テストサークル')).toBeVisible();
  const me = await (await invitee.request.get('/api/auth/me')).json();
  expect(me.member).toMatchObject({ email, displayName, role: 'member' });
  await expectNoHorizontalScroll(invitee, 'イベント一覧（初回登録後）');

  // 同じ招待 URL は再利用できない（accepted）
  await invitee.goto(path);
  await expect(invitee.getByRole('alert')).toHaveText('この招待URLは無効です');
  await inviteeContext.close();

  // admin: 登録済みに移り、招待中からは消える
  await page.reload();
  const registered = page.getByRole('list', { name: '登録済みメンバーの一覧' }).getByRole('listitem').filter({ hasText: email });
  await expect(registered).toContainText(displayName);
  await expect(registered).toContainText('メンバー');
  await expect(page.getByRole('list', { name: '招待中の一覧' }).getByText(email)).toHaveCount(0);

  // 登録した Email / Password でログインできる（AC-01）
  const loginContext = await browser.newContext({ baseURL: BASE_URL });
  const loginPage = await loginContext.newPage();
  await loginViaUi(loginPage, { circleLoginId: circle.circleLoginId, email, password, displayName });
  await loginContext.close();
});
