import { describe, expect, it, vi } from 'vitest';
import { createMemberUsecase, type MemberRepository } from '../../src/usecase/members';
import { addMs, DAY_MS } from '../../src/usecase/time';
import { adminOf, CIRCLE_A, expectAppError, memberOf, NOW } from './fakes';

function setup() {
  const repo: MemberRepository = {
    listMembers: vi.fn(async () => []),
    listPendingInvitations: vi.fn(async () => [
      { id: 'i1', email: 'a@example.com', expiresAt: addMs(NOW, DAY_MS), createdAt: NOW },
      { id: 'i2', email: 'b@example.com', expiresAt: NOW, createdAt: NOW },
    ]),
  };
  return { usecase: createMemberUsecase({ members: repo, now: () => NOW }), repo };
}

describe('members usecase', () => {
  it('member は一覧を見られない（403、取得しない）', async () => {
    const { usecase, repo } = setup();
    await expectAppError(usecase.list(memberOf(CIRCLE_A)), 'FORBIDDEN');
    expect(repo.listMembers).not.toHaveBeenCalled();
    expect(repo.listPendingInvitations).not.toHaveBeenCalled();
  });

  it('admin は自分の Circle の一覧を見られる。expires_at <= 現在 の招待は expired（B3）', async () => {
    const { usecase, repo } = setup();
    const body = await usecase.list(adminOf(CIRCLE_A));
    expect(repo.listMembers).toHaveBeenCalledWith(CIRCLE_A);
    expect(repo.listPendingInvitations).toHaveBeenCalledWith(CIRCLE_A);
    expect(body.invitations.map((i) => [i.id, i.status])).toEqual([
      ['i1', 'pending'],
      ['i2', 'expired'],
    ]);
  });
});
