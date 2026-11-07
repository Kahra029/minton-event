/**
 * ログアウトボタン（AppLayout のヘッダーに配置済み）。
 * 担当: T1。POST /api/auth/logout 成功後に lib/auth.ts の useSetLoggedOut() を呼ぶ
 * （me が null になり RequireAuth が /login/<最後の circleLoginId> へ送る）。
 */
export function LogoutButton() {
  return null;
}
