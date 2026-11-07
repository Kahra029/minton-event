/**
 * 招待（T4）。契約: packages/types/src/invitations.ts
 * - 作成（admin のみ）: 同じ Email の Member がいれば 409（B5）、同じ Email の pending は revoked にして作り直す（B4）、
 *   招待メールを送る（A4 / C7）。送れなかった招待は revoked にして 500
 * - Token から使える招待（pending かつ期限内: B3）を引く。使えなければ理由を区別せず 404（C11）
 * - 初回登録（AC-15〜17 / C9）: Email・Circle は Invitation から取り（AC-16）、Member 作成後に Session を発行する
 */
import {
  INVITATION_INVALID_MESSAGE,
  INVITATION_TTL_DAYS,
  type AcceptInvitationRequest,
  type Invitation,
  type InvitationInfoResponse,
  type MeResponse,
} from '@minton/types';
import { assertAdmin } from './authorization';
import { conflict, internalError, notFound } from './errors';
import type { AuthMember, NewId, Now, PasswordHasher, RequestLogger, TokenService } from './ports';
import { issueSession, type SessionRepository } from './session';
import { addMs, DAY_MS } from './time';

const MEMBER_EXISTS_MESSAGE = 'このメールアドレスのメンバーは既に登録されています';

export type InvitationRecord = {
  id: string;
  circleId: string;
  email: string;
  tokenHash: string;
  status: 'pending' | 'accepted' | 'revoked';
  expiresAt: string;
  createdBy: string;
  createdAt: string;
  acceptedAt: string | null;
};

export type InvitationCircle = { id: string; circleLoginId: string; name: string };

/** Token から引いた Invitation とその Circle */
export type InvitationWithCircle = { invitation: InvitationRecord; circle: InvitationCircle };

export interface InvitationRepository {
  /** 同じ Circle に同じ Email の Member がいるか（B5 / C11） */
  memberExistsByEmail(circleId: string, email: string): Promise<boolean>;
  findCircle(circleId: string): Promise<InvitationCircle | undefined>;
  /** B4: 同じ Circle・同じ Email の pending を revoked にしてから作成する（原子的に） */
  createRevokingPending(invitation: InvitationRecord): Promise<void>;
  /** Token ハッシュで Invitation とその Circle を引く（状態は問わない）。Circle を知らない状態（未ログイン）で使うため */
  findByTokenHash(tokenHash: string): Promise<InvitationWithCircle | null>;
  /**
   * Member 作成と accepted 更新を原子的に行う。どちらも「まだ pending かつ期限内」が条件。
   * 使えなくなっていたら 'unusable'、同じ Email の Member が同時に作られていたら 'email_taken'
   */
  accept(params: {
    invitation: Pick<InvitationRecord, 'id' | 'circleId' | 'email'>;
    memberId: string;
    displayName: string;
    passwordHash: string;
    now: string;
  }): Promise<'accepted' | 'unusable' | 'email_taken'>;
  /** pending のときだけ revoked にする */
  revoke(circleId: string, invitationId: string): Promise<void>;
}

export type InvitationMail = {
  invitationId: string;
  to: string;
  circleName: string;
  /** 例: https://example.com/invitations/<token> */
  invitationUrl: string;
};

/** 招待メールの送信（Resend / 開発環境ではログ: C7） */
export type MailSender = (mail: InvitationMail) => Promise<void>;

export type InvitationDeps = {
  invitations: InvitationRepository;
  sessions: SessionRepository;
  tokens: TokenService;
  password: PasswordHasher;
  mail: MailSender;
  /** 招待 URL の基準（APP_BASE_URL。末尾 / なし）。未設定なら null */
  appBaseUrl: string | null;
  now: Now;
  newId: NewId;
  log: RequestLogger;
};

/** 招待 URL（web の /invitations/:token） */
export function buildInvitationUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/invitations/${encodeURIComponent(token)}`;
}

/** 使える招待は pending かつ期限内だけ（B3: expired は保存せず expires_at <= 現在 で判定） */
export function isUsableInvitation(invitation: Pick<InvitationRecord, 'status' | 'expiresAt'>, now: string): boolean {
  return invitation.status === 'pending' && invitation.expiresAt > now;
}

export function createInvitationUsecase(deps: InvitationDeps) {
  /** 存在しない・accepted・revoked・期限切れはすべて同じ 404（C11: 理由を区別しない） */
  async function findUsableOr404(token: string, now: string): Promise<InvitationWithCircle> {
    const found = await deps.invitations.findByTokenHash(await deps.tokens.hash(token));
    if (!found || !isUsableInvitation(found.invitation, now)) throw notFound(INVITATION_INVALID_MESSAGE);
    deps.log.addContext({ circleId: found.circle.id, invitationId: found.invitation.id });
    return found;
  }

  return {
    /** admin のみ（AC-13 / AC-14 / B2 / B4 / B5） */
    async create(member: AuthMember, email: string): Promise<Invitation> {
      assertAdmin(member);
      if (await deps.invitations.memberExistsByEmail(member.circleId, email)) throw conflict(MEMBER_EXISTS_MESSAGE);

      // 招待 URL は設定値からのみ作る（推測しない）。未設定なら Invitation を作らずエラー
      const baseUrl = deps.appBaseUrl;
      if (!baseUrl) {
        deps.log.error('app_base_url_not_configured');
        throw internalError();
      }

      const circle = await deps.invitations.findCircle(member.circleId);
      if (!circle) throw notFound();

      const token = deps.tokens.generate();
      const now = deps.now();
      const invitation: InvitationRecord = {
        id: deps.newId(),
        circleId: member.circleId,
        email,
        tokenHash: await deps.tokens.hash(token),
        status: 'pending',
        expiresAt: addMs(now, INVITATION_TTL_DAYS * DAY_MS),
        createdBy: member.id,
        createdAt: now,
        acceptedAt: null,
      };
      await deps.invitations.createRevokingPending(invitation);
      deps.log.addContext({ invitationId: invitation.id });

      try {
        await deps.mail({
          invitationId: invitation.id,
          to: email,
          circleName: circle.name,
          invitationUrl: buildInvitationUrl(baseUrl, token),
        });
      } catch (e) {
        // 送信できなかった招待は使えないようにしてから 500（C16）
        await deps.invitations.revoke(member.circleId, invitation.id);
        deps.log.error('invitation_mail_failed', {
          circleId: member.circleId,
          invitationId: invitation.id,
          errorName: e instanceof Error ? e.name : 'Unknown',
          errorMessage: e instanceof Error ? e.message : undefined,
        });
        throw internalError();
      }

      return {
        id: invitation.id,
        email: invitation.email,
        status: 'pending',
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      };
    },

    /** 招待情報（Circle 名・招待先 Email） */
    async getInfo(token: string): Promise<InvitationInfoResponse> {
      const { invitation, circle } = await findUsableOr404(token, deps.now());
      return { circleName: circle.name, email: invitation.email };
    },

    /**
     * 初回登録の 1 段目: Token を検証する（使えなければ 404）。返した関数で登録する。
     * 入力の検証は Token の検証の後に行う（不正な Token なら入力に関係なく 404）ため 2 段に分けている。
     * 検証と登録で同じ「現在時刻」を使う。
     */
    async prepareAccept(token: string) {
      const now = deps.now();
      const { invitation, circle } = await findUsableOr404(token, now);

      return async (input: AcceptInvitationRequest): Promise<{ me: MeResponse; sessionToken: string }> => {
        if (await deps.invitations.memberExistsByEmail(invitation.circleId, invitation.email)) {
          throw conflict(MEMBER_EXISTS_MESSAGE);
        }
        const memberId = deps.newId();
        const result = await deps.invitations.accept({
          invitation,
          memberId,
          displayName: input.displayName,
          passwordHash: await deps.password.hash(input.password),
          now,
        });
        if (result === 'email_taken') throw conflict(MEMBER_EXISTS_MESSAGE);
        // 検証後に別リクエストで使われた・期限が切れた場合
        if (result === 'unusable') throw notFound(INVITATION_INVALID_MESSAGE);

        deps.log.addContext({ memberId });
        const { token: sessionToken } = await issueSession(deps, { circleId: invitation.circleId, memberId });
        return {
          me: {
            member: { id: memberId, email: invitation.email, displayName: input.displayName, role: 'member' },
            circle: { id: circle.id, circleLoginId: circle.circleLoginId, name: circle.name },
          },
          sessionToken,
        };
      };
    },
  };
}

export type InvitationUsecase = ReturnType<typeof createInvitationUsecase>;
