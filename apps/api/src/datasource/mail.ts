/**
 * 招待メール送信（decisions A4 / C7）。usecase の MailSender の実装。
 * - RESEND_API_KEY 未設定（開発環境）: 実送信せず、招待 URL をログに出す（C7 の例外。本番では出さない）
 * - RESEND_API_KEY 設定済み: Resend の HTTP API を fetch で呼ぶ（SDK は追加しない）。
 *   送信元は MAIL_FROM（vars）。未設定なら送信エラーとして扱う
 *
 * Token は招待 URL の中にしか現れない。dev 経路以外で招待 URL / Token をログに出さないこと。
 */
import type { InvitationMail, MailSender } from '../usecase/invitations';
import type { LogFn } from '../usecase/ports';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

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
export function devLogSender(log: LogFn): MailSender {
  return async (mail) => {
    log('info', 'invitation_mail_dev', {
      invitationId: mail.invitationId,
      invitationUrl: mail.invitationUrl,
    });
  };
}

export function resendSender(apiKey: string, from: string | undefined): MailSender {
  return async (mail) => {
    if (!from?.trim()) throw new Error('MAIL_FROM is not configured');
    const { subject, text } = invitationMailContent(mail);
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: from.trim(), to: [mail.to], subject, text }),
    });
    // レスポンス本文は読まない・出さない（エラーの種別はステータスで足りる）
    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
  };
}

/** 環境に応じた送信手段（RESEND_API_KEY の有無で dev 判定） */
export function getMailSender(env: { RESEND_API_KEY?: string; MAIL_FROM?: string }, log: LogFn): MailSender {
  if (!env.RESEND_API_KEY) return devLogSender(log);
  return resendSender(env.RESEND_API_KEY, env.MAIL_FROM);
}
