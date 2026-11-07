/**
 * Session Cookie の読み書き（decisions A2 / C1）。Session の発行・検証は usecase（usecase/session.ts / auth.ts）。
 * Cookie: HttpOnly / SameSite=Lax / Path=/ / Secure（https のとき）。有効期限は Session と同じ 30 日。
 */
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { SESSION_TTL_MS } from '../usecase/session';

export const SESSION_COOKIE_NAME = 'session';

export function readSessionToken(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE_NAME);
}

/** ログイン成功時・招待からの初回登録時 */
export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isHttps(c),
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

/** ログアウト時 */
export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/', secure: isHttps(c), httpOnly: true, sameSite: 'Lax' });
}

function isHttps(c: Context): boolean {
  return new URL(c.req.url).protocol === 'https:';
}
