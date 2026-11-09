import type { APIRequestContext, Page } from '@playwright/test';
import {
  expect,
  randomIpHeaders,
  test,
  BASE_URL,
  createEventViaApi,
  createMemberViaInvitation,
  expectNoHorizontalScroll,
  loggedInApi,
  loginViaUi,
  seedCircle,
  uniqueSuffix,
  type Credentials,
  type SeededCircle,
} from './support/helpers';

/**
 * Attendance 登録・変更（guardrails §11）。AC-07 / AC-08 / AC-09 / AC-20 / AC-21。
 * 確認ダイアログが出ないこと（AC-21）は、ネイティブ dialog と role=dialog の両方で確認する。
 */
let circle: SeededCircle;
let member: Credentials;
let adminApi: APIRequestContext;

test.beforeAll(async () => {
  circle = seedCircle('出欠テストサークル');
  adminApi = await loggedInApi(circle.admin);
  member = await createMemberViaInvitation(adminApi, circle.circleLoginId, 'E2Eメンバー');
});

test.afterAll(async () => {
  await adminApi?.dispose();
});

/** ネイティブの確認ダイアログ（confirm 等）を記録する。AC-21 では 1 件も出ないこと */
function watchDialogs(page: Page): string[] {
  const shown: string[] = [];
  page.on('dialog', async (dialog) => {
    shown.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.dismiss();
  });
  return shown;
}

async function openEvent(page: Page, title: string) {
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

async function expectCounts(page: Page, counts: { attending: number; absent: number; unanswered: number }) {
  await expect(page.getByLabel(`参加 ${counts.attending}人`, { exact: true })).toBeVisible();
  await expect(page.getByLabel(`不参加 ${counts.absent}人`, { exact: true })).toBeVisible();
  await expect(page.getByLabel(`未回答 ${counts.unanswered}人`, { exact: true })).toBeVisible();
}

test('参加をタップするだけで保存・反映される（AC-07 / AC-21）', async ({ page }) => {
  const title = `参加登録 ${uniqueSuffix()}`;
  await createEventViaApi(adminApi, { title, location: '市民体育館', days: 2 });
  const dialogs = watchDialogs(page);

  await loginViaUi(page, member);
  await openEvent(page, title);
  await expectCounts(page, { attending: 0, absent: 0, unanswered: 2 });

  const attend = page.getByRole('button', { name: '参加', exact: true });
  await attend.click();
  // 確認 UI を挟まずに反映される
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(dialogs, '確認ダイアログが出ない').toEqual([]);
  await expect(attend).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('my-status')).toHaveText('参加');
  await expectCounts(page, { attending: 1, absent: 0, unanswered: 1 });
  await expect(page.getByRole('listitem').filter({ hasText: 'E2Eメンバー（自分）' })).toContainText('参加');
  await expectNoHorizontalScroll(page, 'イベント詳細（参加登録後）');

  // 保存されている（再読み込みしても残る）
  await page.reload();
  await expect(page.getByTestId('my-status')).toHaveText('参加');
  await expectCounts(page, { attending: 1, absent: 0, unanswered: 1 });

  // 一覧にも反映される
  await page.getByRole('link', { name: 'イベント一覧' }).first().click();
  const card = page.getByRole('link', { name: new RegExp(title) });
  await expect(card).toContainText('自分: 参加');
  await expect(card).toContainText('参加 1人');
});

test('不参加を登録でき、他の Member からも確認できる（AC-08 / AC-21）', async ({ page, browser }) => {
  const title = `不参加登録 ${uniqueSuffix()}`;
  await createEventViaApi(adminApi, { title, location: '市民体育館', days: 2 });
  const dialogs = watchDialogs(page);

  await loginViaUi(page, member);
  await openEvent(page, title);
  await page.getByRole('button', { name: '不参加', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(dialogs, '確認ダイアログが出ない').toEqual([]);
  await expect(page.getByTestId('my-status')).toHaveText('不参加');
  await expectCounts(page, { attending: 0, absent: 1, unanswered: 1 });

  // admin（別の Member）から見える
  const adminContext = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: randomIpHeaders() });
  const adminPage = await adminContext.newPage();
  await loginViaUi(adminPage, circle.admin);
  await openEvent(adminPage, title);
  await expectCounts(adminPage, { attending: 0, absent: 1, unanswered: 1 });
  await expect(adminPage.getByRole('listitem').filter({ hasText: 'E2Eメンバー' })).toContainText('不参加');
  await adminContext.close();
});

test('参加 → 不参加 → 参加 に変更すると人数が増減する（AC-09）', async ({ page }) => {
  const title = `出欠変更 ${uniqueSuffix()}`;
  await createEventViaApi(adminApi, { title, location: '市民体育館', days: 2 });
  const dialogs = watchDialogs(page);

  await loginViaUi(page, member);
  await openEvent(page, title);

  await page.getByRole('button', { name: '参加', exact: true }).click();
  await expect(page.getByTestId('my-status')).toHaveText('参加');
  await expectCounts(page, { attending: 1, absent: 0, unanswered: 1 });

  await page.getByRole('button', { name: '不参加', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(dialogs, '確認ダイアログが出ない').toEqual([]);
  await expect(page.getByTestId('my-status')).toHaveText('不参加');
  await expectCounts(page, { attending: 0, absent: 1, unanswered: 1 });

  await page.getByRole('button', { name: '参加', exact: true }).click();
  await expect(page.getByTestId('my-status')).toHaveText('参加');
  await expectCounts(page, { attending: 1, absent: 0, unanswered: 1 });

  // 変更しても Attendance は 1 件（Member 一覧の自分の行が 1 つで、合計が増えない）
  await expect(page.getByRole('listitem').filter({ hasText: 'E2Eメンバー（自分）' })).toHaveCount(1);
  await page.reload();
  await expectCounts(page, { attending: 1, absent: 0, unanswered: 1 });
  await expectNoHorizontalScroll(page, 'イベント詳細（出欠変更後）');
});
