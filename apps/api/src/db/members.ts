/**
 * メンバー一覧のクエリ（担当: T4）。すべて circleId で絞り込む。
 */
import { and, asc, desc, eq } from 'drizzle-orm';
import type { DB } from './client';
import { invitations, members } from './schema';

/** 登録済み Member（Display Name 昇順） */
export async function listMembers(db: DB, circleId: string) {
  return db
    .select({
      id: members.id,
      email: members.email,
      displayName: members.displayName,
      role: members.role,
      createdAt: members.createdAt,
    })
    .from(members)
    .where(eq(members.circleId, circleId))
    .orderBy(asc(members.displayName), asc(members.id));
}

/** 未登録の Invitation（pending のみ。期限切れの判定は呼び出し側: B3）。新しい順 */
export async function listPendingInvitations(db: DB, circleId: string) {
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(and(eq(invitations.circleId, circleId), eq(invitations.status, 'pending')))
    .orderBy(desc(invitations.createdAt), desc(invitations.id));
}

/** 同じ Circle に同じ Email の Member がいるか（B5 / C11） */
export async function memberExistsByEmail(db: DB, circleId: string, email: string): Promise<boolean> {
  const row = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.circleId, circleId), eq(members.email, email)))
    .limit(1);
  return row.length > 0;
}
