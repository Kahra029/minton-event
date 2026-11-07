/**
 * 認証（T1）。契約: packages/types/src/auth.ts
 * - login: circleLoginId → Circle、Circle ID + Email → Member、Password を照合して Session を発行（A2 / A3 / B12）
 * - logout: Session をサーバー側で削除（A2 / B9）
 * - authenticate: Session Token からログイン中の Member を解決（requireAuth が使う）
 */
import { LOGIN_FAILED_MESSAGE, type LoginRequest, type MeResponse } from '@minton/types';
import { notFound, unauthorized } from './errors';
import type { AuthMember, Now, PasswordHasher, RequestLogger, TokenService } from './ports';
import { issueSession, type SessionRepository } from './session';

export interface AuthRepository {
  findCircleByLoginId(circleLoginId: string): Promise<{ id: string } | undefined>;
  /** Circle ID + Email で Member を取得する（Email は正規化済み: C5） */
  findMemberByEmail(circleId: string, email: string): Promise<{ id: string; passwordHash: string } | undefined>;
  /** ログイン中の Member と所属 Circle。Password Hash は含めない */
  findMe(circleId: string, memberId: string): Promise<MeResponse | null>;
}

export type AuthDeps = {
  auth: AuthRepository;
  sessions: SessionRepository;
  tokens: TokenService;
  password: PasswordHasher;
  now: Now;
  log: RequestLogger;
};

export function createAuthUsecase(deps: AuthDeps) {
  return {
    /** 成功したら Me と Session Token（Cookie に載せる）を返す */
    async login(input: LoginRequest): Promise<{ me: MeResponse; sessionToken: string }> {
      const circle = await deps.auth.findCircleByLoginId(input.circleLoginId);
      if (!circle) throw notFound('サークルが見つかりません');
      deps.log.addContext({ circleId: circle.id });

      const member = await deps.auth.findMemberByEmail(circle.id, input.email);
      // Member がいない場合もダミーで照合し、Email 違いと Password 違いを区別しない（B12）
      const ok = await deps.password.verify(input.password, member?.passwordHash ?? null);
      if (!member || !ok) throw unauthorized(LOGIN_FAILED_MESSAGE);
      deps.log.addContext({ memberId: member.id });

      const me = await deps.auth.findMe(circle.id, member.id);
      if (!me) throw unauthorized(LOGIN_FAILED_MESSAGE);
      const { token } = await issueSession(deps, { circleId: circle.id, memberId: member.id });
      return { me, sessionToken: token };
    },

    /** Session を削除する。Token が無い・無効でもエラーにしない */
    async logout(sessionToken: string | undefined): Promise<void> {
      if (sessionToken) await deps.sessions.deleteByTokenHash(await deps.tokens.hash(sessionToken));
    },

    /** 有効な Session の Member。無効・期限切れ・Member が消えている場合は null */
    async authenticate(sessionToken: string | undefined): Promise<AuthMember | null> {
      if (!sessionToken) return null;
      return deps.sessions.findMemberByTokenHash(await deps.tokens.hash(sessionToken), deps.now());
    },

    async getMe(member: AuthMember): Promise<MeResponse> {
      const me = await deps.auth.findMe(member.circleId, member.id);
      if (!me) throw unauthorized();
      return me;
    },
  };
}

export type AuthUsecase = ReturnType<typeof createAuthUsecase>;
