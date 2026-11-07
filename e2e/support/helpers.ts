/**
 * E2E 用のテストデータ準備と共通操作（担当: T5）。
 *
 * - データはすべてローカル D1（apps/api/.wrangler）に作る。remote には触れない。
 *   - Circle と admin: seed CLI（apps/api/scripts/seed.ts、既定で --local）
 *   - Event: admin で API（POST /api/events）を呼ぶ
 *   - member: admin で招待 API を呼び、dev ログの招待 URL（decisions C7）から初回登録 API を呼ぶ
 * - 招待 URL は RESEND_API_KEY 未設定の api が出す `invitation_mail_dev` ログから取る（C7）。
 *   ログの場所は環境変数 E2E_DEV_LOG（e2e/run-local.mjs が dev サーバーの出力を保存して渡す）。
 * - データは毎回一意な circleLoginId / Email で作るので、掃除はしない。
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import { expect, request as playwrightRequest, type APIRequestContext, type Page } from '@playwright/test';

export const BASE_URL = 'http://localhost:5173';

export type Credentials = { circleLoginId: string; email: string; password: string; displayName: string };
export type SeededCircle = { circleLoginId: string; circleName: string; admin: Credentials };

export function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
}

export function newPassword(): string {
  return randomBytes(12).toString('base64url');
}

/** seed CLI でローカル D1 に Circle と admin を作る */
export function seedCircle(circleName = 'E2Eサークル'): SeededCircle {
  const circleLoginId = `e2e-${uniqueSuffix()}`;
  const admin: Credentials = {
    circleLoginId,
    email: `admin-${uniqueSuffix()}@example.com`,
    password: newPassword(),
    displayName: 'E2E管理者',
  };
  execFileSync(
    'node',
    [
      'scripts/seed.ts',
      '--circle-login-id',
      circleLoginId,
      '--circle-name',
      circleName,
      '--email',
      admin.email,
      '--name',
      admin.displayName,
    ],
    {
      cwd: path.resolve(import.meta.dirname, '../../apps/api'),
      input: `${admin.password}\n`,
      stdio: ['pipe', 'ignore', 'inherit'],
    },
  );
  return { circleLoginId, circleName, admin };
}

/** ログイン済みの API コンテキスト（Session Cookie を保持する）。使い終わったら dispose() する */
export async function loggedInApi(creds: Credentials): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL });
  const res = await ctx.post('/api/auth/login', {
    data: { circleLoginId: creds.circleLoginId, email: creds.email, password: creds.password },
  });
  expect(res.status(), 'API ログイン').toBe(200);
  return ctx;
}

/** 現在から days 日後の JST の日時（<input type="datetime-local"> の値と UTC ISO） */
export function futureJst(days: number, hour: number, minute = 0): { local: string; iso: string } {
  const jstMs = Date.now() + 9 * 3600_000 + days * 86_400_000;
  const d = new Date(jstMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(hour)}:${pad(minute)}`;
  const iso = new Date(`${local}:00+09:00`).toISOString();
  return { local, iso };
}

export async function createEventViaApi(
  admin: APIRequestContext,
  input: { title: string | null; location: string; days: number },
): Promise<{ id: string }> {
  const res = await admin.post('/api/events', {
    data: {
      title: input.title,
      location: input.location,
      startAt: futureJst(input.days, 19).iso,
      endAt: futureJst(input.days, 21).iso,
    },
  });
  expect(res.status(), 'Event 作成 API').toBe(201);
  return (await res.json()).event;
}

/**
 * dev ログ（decisions C7）から、指定した Invitation の招待 URL を取り出す。
 * 招待 URL・Token はテストの出力に出さない。
 */
export async function readInvitationUrl(invitationId: string): Promise<string> {
  const logPath = process.env.E2E_DEV_LOG;
  if (!logPath) {
    throw new Error(
      'E2E_DEV_LOG が未設定です。招待 URL は dev サーバーのログから取るため、`npm run test:e2e`（e2e/run-local.mjs）で実行してください',
    );
  }
  let found: string | undefined;
  await expect
    .poll(
      () => {
        const text = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
        for (const line of text.split('\n')) {
          const start = line.indexOf('{');
          if (start < 0 || !line.includes('invitation_mail_dev')) continue;
          try {
            const entry = JSON.parse(line.slice(start)) as { message?: string; invitationId?: string; invitationUrl?: string };
            if (entry.message === 'invitation_mail_dev' && entry.invitationId === invitationId) {
              found = entry.invitationUrl;
              return true;
            }
          } catch {
            // JSON でない行は無視する
          }
        }
        return false;
      },
      { message: `Invitation ${invitationId} の招待 URL が dev ログに出ていること（C7）`, timeout: 10_000 },
    )
    .toBe(true);
  return found!;
}

/** 招待 URL を、テスト対象の web（baseURL）上のパスに直す（APP_BASE_URL のオリジンは .dev.vars に依存するため） */
export function invitationPath(invitationUrl: string): string {
  const url = new URL(invitationUrl);
  expect(url.pathname).toMatch(/^\/invitations\/[^/]+$/);
  return url.pathname;
}

/** admin の API で招待 → dev ログの招待 URL で初回登録し、member を作る */
export async function createMemberViaInvitation(
  admin: APIRequestContext,
  circleLoginId: string,
  displayName: string,
): Promise<Credentials> {
  const email = `member-${uniqueSuffix()}@example.com`;
  const created = await admin.post('/api/invitations', { data: { email } });
  expect(created.status(), '招待作成 API').toBe(201);
  const { invitation } = await created.json();
  const token = decodeURIComponent(invitationPath(await readInvitationUrl(invitation.id)).split('/')[2]);

  const password = newPassword();
  const anon = await playwrightRequest.newContext({ baseURL: BASE_URL });
  try {
    const res = await anon.post(`/api/invitations/${encodeURIComponent(token)}/accept`, {
      data: { displayName, password, passwordConfirmation: password },
    });
    expect(res.status(), '初回登録 API').toBe(201);
  } finally {
    await anon.dispose();
  }
  return { circleLoginId, email, password, displayName };
}

/** 画面からログインしてイベント一覧に着く（AC-01） */
export async function loginViaUi(page: Page, creds: Credentials): Promise<void> {
  await page.goto(`/login/${creds.circleLoginId}`);
  await page.getByLabel('メールアドレス').fill(creds.email);
  await page.getByLabel('パスワード').fill(creds.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL(/\/events$/);
}

/** 横スクロールが発生しない（AC-20 / guardrails §12） */
export async function expectNoHorizontalScroll(page: Page, screen: string): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `${screen} で横スクロールが発生しない`).toBeLessThanOrEqual(innerWidth);
}
