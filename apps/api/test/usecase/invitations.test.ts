import { describe, expect, it, vi } from 'vitest';
import { INVITATION_INVALID_MESSAGE } from '@minton/types';
import {
  createInvitationUsecase,
  type InvitationDeps,
  type InvitationRecord,
  type InvitationRepository,
} from '../../src/usecase/invitations';
import { addMs, DAY_MS } from '../../src/usecase/time';
import {
  adminOf,
  CIRCLE_A,
  expectAppError,
  fakeIds,
  fakeLog,
  fakePassword,
  fakeSessions,
  fakeTokens,
  memberOf,
  NOW,
} from './fakes';

const circleA = { id: CIRCLE_A, circleLoginId: 'circle-a-login', name: 'サークルA' };

function invitation(overrides: Partial<InvitationRecord> & { token: string }): InvitationRecord {
  const { token, ...rest } = overrides;
  return {
    id: `inv-${token}`,
    circleId: CIRCLE_A,
    email: `${token}@example.com`,
    tokenHash: `hash:${token}`,
    status: 'pending',
    expiresAt: addMs(NOW, DAY_MS),
    createdBy: adminOf(CIRCLE_A).id,
    createdAt: NOW,
    acceptedAt: null,
    ...rest,
  };
}

function setup(options: { invitations?: InvitationRecord[]; memberEmails?: string[]; deps?: Partial<InvitationDeps> } = {}) {
  const stored = [...(options.invitations ?? [])];
  const memberEmails = new Set(options.memberEmails ?? []);
  const repo: InvitationRepository = {
    memberExistsByEmail: async (circleId, email) => circleId === CIRCLE_A && memberEmails.has(email),
    createRevokingPending: vi.fn(async (inv) => void stored.push(inv)),
    findByTokenHash: async (tokenHash) => {
      const inv = stored.find((i) => i.tokenHash === tokenHash);
      return inv ? { invitation: inv, circle: circleA } : null;
    },
    accept: vi.fn(async () => 'accepted' as const),
  };
  const sessions = fakeSessions();
  const { log, context, errors } = fakeLog();
  const usecase = createInvitationUsecase({
    invitations: repo,
    sessions: sessions.repo,
    tokens: fakeTokens,
    password: fakePassword,
    appBaseUrl: 'https://app.example.test',
    now: () => NOW,
    newId: fakeIds(),
    log,
    ...options.deps,
  });
  return { usecase, repo, stored, sessions, context, errors };
}

describe('invitations usecase: 作成', () => {
  it('member は招待できない（403、作成しない）', async () => {
    const { usecase, repo } = setup();
    await expectAppError(usecase.create(memberOf(CIRCLE_A), 'new@example.com'), 'FORBIDDEN');
    expect(repo.createRevokingPending).not.toHaveBeenCalled();
  });

  it('admin は招待できる。Token はハッシュだけ保存し、平文は戻り値の招待 URL にだけ載せる（C31）', async () => {
    const { usecase, stored, context, errors } = setup();
    const created = await usecase.create(adminOf(CIRCLE_A), 'new@example.com');
    expect(created).toEqual({
      invitation: {
        id: 'id-1',
        email: 'new@example.com',
        status: 'pending',
        expiresAt: addMs(NOW, 7 * DAY_MS),
        createdAt: NOW,
      },
      invitationUrl: 'https://app.example.test/invitations/generated-token',
    });
    expect(stored[0]).toMatchObject({ circleId: CIRCLE_A, tokenHash: 'hash:generated-token', status: 'pending' });
    // ログには Token / URL を渡さない
    expect(context).toEqual({ invitationId: 'id-1' });
    expect(errors).toEqual([]);
  });

  it('同じ Email の Member がいれば 409（B5）', async () => {
    const { usecase, repo } = setup({ memberEmails: ['taken@example.com'] });
    await expectAppError(usecase.create(adminOf(CIRCLE_A), 'taken@example.com'), 'CONFLICT');
    expect(repo.createRevokingPending).not.toHaveBeenCalled();
  });

  it('APP_BASE_URL 未設定なら作成せず 500', async () => {
    const { usecase, repo, errors } = setup({ deps: { appBaseUrl: null } });
    await expectAppError(usecase.create(adminOf(CIRCLE_A), 'new@example.com'), 'INTERNAL_ERROR');
    expect(repo.createRevokingPending).not.toHaveBeenCalled();
    expect(errors.map((e) => e.message)).toEqual(['app_base_url_not_configured']);
  });
});

describe('invitations usecase: Token の状態ごとの拒否（C11: 理由を区別せず 404）', () => {
  const cases: [string, InvitationRecord[]][] = [
    ['存在しない', []],
    ['accepted', [invitation({ token: 't', status: 'accepted', acceptedAt: NOW })]],
    ['revoked', [invitation({ token: 't', status: 'revoked' })]],
    ['期限切れ（expires_at = 現在）', [invitation({ token: 't', expiresAt: NOW })]],
    ['期限切れ（expires_at < 現在）', [invitation({ token: 't', expiresAt: addMs(NOW, -1) })]],
  ];

  for (const [label, invitations] of cases) {
    it(`${label}: 招待情報は 404`, async () => {
      const { usecase } = setup({ invitations });
      await expectAppError(usecase.getInfo('t'), 'NOT_FOUND', INVITATION_INVALID_MESSAGE);
    });

    it(`${label}: 初回登録は 404（Member を作らない）`, async () => {
      const { usecase, repo, sessions } = setup({ invitations });
      await expectAppError(usecase.prepareAccept('t'), 'NOT_FOUND', INVITATION_INVALID_MESSAGE);
      expect(repo.accept).not.toHaveBeenCalled();
      expect(sessions.rows).toHaveLength(0);
    });
  }

  it('pending かつ期限内なら招待情報を返し、ログに Circle と招待を載せる', async () => {
    const { usecase, context } = setup({ invitations: [invitation({ token: 't' })] });
    expect(await usecase.getInfo('t')).toEqual({ circleName: 'サークルA', email: 't@example.com' });
    expect(context).toEqual({ circleId: CIRCLE_A, invitationId: 'inv-t' });
  });
});

describe('invitations usecase: 初回登録', () => {
  const input = { displayName: '新人', password: 'password1234', passwordConfirmation: 'password1234' };

  it('Email・Circle は Invitation から取り、Member を作って Session を発行する', async () => {
    const { usecase, repo, sessions } = setup({ invitations: [invitation({ token: 't' })] });
    const accept = await usecase.prepareAccept('t');
    const result = await accept(input);
    expect(repo.accept).toHaveBeenCalledWith({
      invitation: expect.objectContaining({ id: 'inv-t', circleId: CIRCLE_A, email: 't@example.com' }),
      memberId: 'id-1',
      displayName: '新人',
      passwordHash: 'pw:password1234',
      now: NOW,
    });
    expect(result.me).toEqual({
      member: { id: 'id-1', email: 't@example.com', displayName: '新人', role: 'member' },
      circle: circleA,
    });
    expect(result.sessionToken).toBe('generated-token');
    expect(sessions.rows).toEqual([
      expect.objectContaining({ tokenHash: 'hash:generated-token', circleId: CIRCLE_A, memberId: 'id-1' }),
    ]);
  });

  it('検証後に使えなくなっていたら 404（Session を発行しない）', async () => {
    const { usecase, repo, sessions } = setup({ invitations: [invitation({ token: 't' })] });
    vi.mocked(repo.accept).mockResolvedValueOnce('unusable');
    const accept = await usecase.prepareAccept('t');
    await expectAppError(accept(input), 'NOT_FOUND', INVITATION_INVALID_MESSAGE);
    expect(sessions.rows).toHaveLength(0);
  });

  it('同じ Email の Member が既にいれば 409', async () => {
    const { usecase, repo } = setup({ invitations: [invitation({ token: 't' })], memberEmails: ['t@example.com'] });
    const accept = await usecase.prepareAccept('t');
    await expectAppError(accept(input), 'CONFLICT');
    expect(repo.accept).not.toHaveBeenCalled();
  });

  it('同時に同じ Email の Member が作られたら 409', async () => {
    const { usecase, repo, sessions } = setup({ invitations: [invitation({ token: 't' })] });
    vi.mocked(repo.accept).mockResolvedValueOnce('email_taken');
    const accept = await usecase.prepareAccept('t');
    await expectAppError(accept(input), 'CONFLICT');
    expect(sessions.rows).toHaveLength(0);
  });
});
