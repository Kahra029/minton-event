import type { AuthMember } from './ports';
import { forbidden } from './errors';

/**
 * admin 専用の操作か判定する。admin 以外は 403。
 * application の requireAdmin もこれを使う（未ログイン 401 → 403 → 入力検証 の順を保つため、route の前で判定する）。
 * admin 専用の usecase も先頭で呼び、usecase 単体でも権限を守る。
 */
export function assertAdmin(member: AuthMember): void {
  if (member.role !== 'admin') throw forbidden();
}
