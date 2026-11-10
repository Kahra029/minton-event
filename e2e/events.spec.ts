import type { APIRequestContext } from '@playwright/test';
import {
  expect,
  randomIpHeaders,
  test,
  BASE_URL,
  createEventViaApi,
  createMemberViaInvitation,
  expectNoHorizontalScroll,
  futureJst,
  loggedInApi,
  loginViaUi,
  seedCircle,
  uniqueSuffix,
  type Credentials,
  type SeededCircle,
} from './support/helpers';

/**
 * Event 確認（一覧 → 詳細）と admin による Event 作成（guardrails §11）。
 * AC-01（ログイン後に自 Circle の一覧だけが見える）/ AC-03 / AC-04 / AC-20。
 * データはローカル D1 に作る（e2e/support/helpers.ts）。`npm run test:e2e`（e2e/run-local.mjs）で実行する。
 */
let circle: SeededCircle;
let other: SeededCircle;
let member: Credentials;
let adminApi: APIRequestContext;
const titled = { title: `練習会 ${uniqueSuffix()}`, location: `市民体育館 ${uniqueSuffix()}` };
const untitledLocation = `第二体育館 ${uniqueSuffix()}`;
const otherCircleLocation = `別サークルの会場 ${uniqueSuffix()}`;
let titledEventId: string;

test.beforeAll(async () => {
  circle = seedCircle('E2Eサークル');
  other = seedCircle('別のサークル');
  adminApi = await loggedInApi(circle.admin);
  member = await createMemberViaInvitation(adminApi, circle.circleLoginId, 'E2Eメンバー');
  titledEventId = (await createEventViaApi(adminApi, { ...titled, days: 3 })).id;
  await createEventViaApi(adminApi, { title: null, location: untitledLocation, days: 5 });

  const otherApi = await loggedInApi(other.admin);
  await createEventViaApi(otherApi, { title: '別サークルの練習', location: otherCircleLocation, days: 4 });
  await otherApi.dispose();
});

test.afterAll(async () => {
  await adminApi?.dispose();
});

test('member がイベント一覧から詳細を確認できる（別 Circle の Event は出ない）', async ({ page }) => {
  await loginViaUi(page, member);
  await expect(page.getByRole('heading', { name: 'イベント一覧' })).toBeVisible();

  const titledCard = page.getByRole('link', { name: new RegExp(titled.title) });
  await expect(titledCard).toBeVisible();
  await expect(titledCard).toContainText(titled.location);
  await expect(titledCard).toContainText('自分: 未回答');
  await expect(titledCard).toContainText('参加 0人');
  // Title なしの Event は日時を見出しにし、場所を表示する（B6）
  await expect(page.getByRole('link', { name: new RegExp(untitledLocation) })).toBeVisible();
  // 別 Circle の Event は表示されない（AC-01）
  await expect(page.getByText(otherCircleLocation)).toHaveCount(0);
  await expectNoHorizontalScroll(page, 'イベント一覧');

  await titledCard.click();
  await expect(page).toHaveURL(new RegExp(`/events/${titledEventId}$`));
  await expect(page.getByRole('heading', { level: 1, name: titled.title })).toBeVisible();
  await expect(page.getByText(titled.location)).toBeVisible();
  await expect(page.getByTestId('my-status')).toHaveText('未回答');
  await expect(page.getByLabel('参加 0人', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '参加', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '不参加', exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page, 'イベント詳細');
});

test('member には Event 作成 UI が出ず、API でも作成できない（AC-04）', async ({ page }) => {
  await loginViaUi(page, member);
  await expect(page.getByRole('heading', { name: 'イベント一覧' })).toBeVisible();
  await expect(page.getByRole('link', { name: /イベント作成/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /メンバー/ })).toHaveCount(0);

  await page.getByRole('link', { name: new RegExp(titled.title) }).click();
  await expect(page.getByRole('heading', { level: 1, name: titled.title })).toBeVisible();
  await expect(page.getByRole('link', { name: /編集/ })).toHaveCount(0);

  // URL を直接開いても作成フォームは出ない
  await page.goto('/events/new');
  await expect(page.getByText('この画面を表示する権限がありません')).toBeVisible();
  await expect(page.getByLabel('場所')).toHaveCount(0);

  // API 直接 Request は 403（ブラウザの Session のまま）
  const res = await page.request.post('/api/events', {
    data: { title: null, location: '不正な作成', startAt: futureJst(2, 19).iso, endAt: futureJst(2, 21).iso },
  });
  expect(res.status()).toBe(403);
  expect((await res.json()).error.code).toBe('FORBIDDEN');
});

test('admin が Event を作成すると詳細へ遷移し、member からも見える（AC-03）', async ({ page, browser }) => {
  const title = `作成テスト ${uniqueSuffix()}`;
  const location = `中央体育館 ${uniqueSuffix()}`;

  await loginViaUi(page, circle.admin);
  await page.getByRole('link', { name: /イベント作成/ }).click();
  await expect(page).toHaveURL(/\/events\/new$/);
  await expect(page.getByRole('heading', { name: 'イベント作成' })).toBeVisible();
  await expectNoHorizontalScroll(page, 'イベント作成');

  await page.getByLabel('開始日時').fill(futureJst(7, 18).local);
  await page.getByLabel('終了日時').fill(futureJst(7, 20, 30).local);
  await page.getByLabel('場所').fill(location);
  await page.getByLabel(/タイトル/).fill(title);
  await page.getByRole('button', { name: '作成する' }).click();

  await expect(page).toHaveURL(/\/events\/(?!new$)[^/]+$/);
  const eventPath = new URL(page.url()).pathname;
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText(location)).toBeVisible();
  await expect(page.getByText(/18:00〜20:30/)).toBeVisible();
  await expect(page.getByLabel('未回答 2人', { exact: true })).toBeVisible(); // admin + member
  await expectNoHorizontalScroll(page, 'イベント詳細（作成直後）');

  // 一覧に出る
  await page.getByRole('link', { name: 'イベント一覧' }).first().click();
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();

  // 同一 Circle の member から閲覧できる
  const memberContext = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: randomIpHeaders() });
  const memberPage = await memberContext.newPage();
  await loginViaUi(memberPage, member);
  await expect(memberPage.getByRole('link', { name: new RegExp(title) })).toBeVisible();
  await memberContext.close();

  // 別 Circle からは閲覧できない（見つかりません）
  const otherContext = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: randomIpHeaders() });
  const otherPage = await otherContext.newPage();
  await loginViaUi(otherPage, other.admin);
  await expect(otherPage.getByRole('link', { name: new RegExp(title) })).toHaveCount(0);
  await otherPage.goto(eventPath);
  await expect(otherPage.getByText('イベントが見つかりません')).toBeVisible();
  await otherContext.close();
});
