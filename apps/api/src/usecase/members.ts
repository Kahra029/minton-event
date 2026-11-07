/**
 * メンバー一覧（T4）。契約: packages/types/src/members.ts
 * admin のみ。Member と未登録 Invitation（pending / expired）を別配列で返す（AC-13 / C6）。
 */
import type { Member, MemberListResponse } from '@minton/types';
import { assertAdmin } from './authorization';
import type { AuthMember, Now } from './ports';

/** すべてのメソッドは circleId で絞り込む（guardrails §2） */
export interface MemberRepository {
  /** 登録済み Member（Display Name 昇順） */
  listMembers(circleId: string): Promise<Member[]>;
  /** status = pending の Invitation（新しい順。期限切れの判定は usecase: B3） */
  listPendingInvitations(
    circleId: string,
  ): Promise<{ id: string; email: string; expiresAt: string; createdAt: string }[]>;
}

export type MemberDeps = { members: MemberRepository; now: Now };

export function createMemberUsecase(deps: MemberDeps) {
  return {
    async list(member: AuthMember): Promise<MemberListResponse> {
      assertAdmin(member);
      const now = deps.now();
      const [members, invitations] = await Promise.all([
        deps.members.listMembers(member.circleId),
        deps.members.listPendingInvitations(member.circleId),
      ]);
      return {
        members,
        invitations: invitations.map((i) => ({
          ...i,
          // B3: expired は保存せず expires_at <= 現在 で判定
          status: i.expiresAt > now ? 'pending' : 'expired',
        })),
      };
    },
  };
}

export type MemberUsecase = ReturnType<typeof createMemberUsecase>;
