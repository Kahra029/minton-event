/**
 * 招待メール送信（decisions A4 / C7 / C23）。usecase の MailSender の実装。
 * - DEV_MAIL_LOG=1（開発環境。`.dev.vars` にだけ置き、wrangler.jsonc の vars には置かない）:
 *   実送信せず、招待 URL をログに出す（C7 の例外。C23 で RESEND_API_KEY の有無ではなくこのフラグで判定する）
 * - それ以外で RESEND_API_KEY 設定済み: Resend の HTTP API を fetch で呼ぶ（SDK は追加しない）。
 *   送信元は MAIL_FROM（vars）。未設定なら送信エラーとして扱う
 * - フラグも RESEND_API_KEY も無い: 送信エラー（usecase が C16 に従い revoked にして 500）
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

/** 開発環境用: 実送信せずログに出す（C7 / C23。DEV_MAIL_LOG=1 のときだけ使う） */
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

/** 送信手段が設定されていない（本番で Secret を入れ忘れた等）。dev 経路には落とさず送信エラーにする（C23） */
export const unconfiguredSender: MailSender = async () => {
  throw new Error('mail sender is not configured');
};

/** dev のログ出力を有効にするフラグ（C23）。値が "1" のときだけ有効 */
export const isDevMailLog = (env: { DEV_MAIL_LOG?: string }) => env.DEV_MAIL_LOG?.trim() === '1';

/** 環境に応じた送信手段（C23: dev かどうかは DEV_MAIL_LOG で明示的に判定する） */
export function getMailSender(
  env: { DEV_MAIL_LOG?: string; RESEND_API_KEY?: string; MAIL_FROM?: string },
  log: LogFn,
): MailSender {
  if (isDevMailLog(env)) return devLogSender(log);
  if (env.RESEND_API_KEY) return resendSender(env.RESEND_API_KEY, env.MAIL_FROM);
  return unconfiguredSender;
}
