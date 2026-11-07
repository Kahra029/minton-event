/**
 * 招待メール送信（decisions A4 / C7。担当: T4）。
 * - RESEND_API_KEY 未設定（開発環境）: 実送信せず、招待 URL をログに出す（C7 の例外。本番では出さない）
 * - RESEND_API_KEY 設定済み: Resend の HTTP API を fetch で呼ぶ（SDK は追加しない）
 *
 * Token は招待 URL の中にしか現れない。dev 経路以外で招待 URL / Token をログに出さないこと。
 */
import type { Bindings } from '../bindings';
import { log } from '../lib/logger';

export type InvitationMail = {
  invitationId: string;
  to: string;
  circleName: string;
  /** 例: https://example.com/invitations/<token> */
  invitationUrl: string;
};

export type MailSender = (mail: InvitationMail) => Promise<void>;

// TODO(T4): 送信元アドレスの決め方を確認中（仮置き）
const MAIL_FROM = 'TODO';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** 招待 URL（web の /invitations/:token。origin はリクエストの origin） */
export function buildInvitationUrl(origin: string, token: string): string {
  return `${origin}/invitations/${encodeURIComponent(token)}`;
}

export function invitationMailContent(mail: InvitationMail): { subject: string; text: string } {
  return {
    subject: `${mail.circleName} への招待`,
    text: [
      `${mail.circleName} に招待されました。`,
      '次の URL を開いて、表示名とパスワードを設定してください。',
      '',
      mail.invitationUrl,
      '',
      'この URL の有効期限は 7 日間です。',
    ].join('\n'),
  };
}

/** 開発環境用: 実送信せずログに出す（C7） */
export const devLogSender: MailSender = async (mail) => {
  log('info', 'invitation_mail_dev', {
    invitationId: mail.invitationId,
    invitationUrl: mail.invitationUrl,
  });
};

export function resendSender(apiKey: string, from: string): MailSender {
  return async (mail) => {
    const { subject, text } = invitationMailContent(mail);
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [mail.to], subject, text }),
    });
    if (!res.ok) {
      // レスポンス本文や URL は出さない（Token を含みうる）
      log('error', 'invitation_mail_failed', { invitationId: mail.invitationId, status: res.status });
      throw new Error(`Resend responded ${res.status}`);
    }
  };
}

/** 環境に応じた送信手段 */
export function getMailSender(env: Pick<Bindings, 'RESEND_API_KEY'>): MailSender {
  if (!env.RESEND_API_KEY) return devLogSender;
  return resendSender(env.RESEND_API_KEY, MAIL_FROM);
}
