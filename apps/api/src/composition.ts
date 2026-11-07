/**
 * composition root（decisions C22）。リクエストごとに env（D1 binding・vars・Secret）から datasource を組み立て、
 * usecase に渡す。application の middleware（provideUsecases）が呼び、結果を c.var.usecases に入れる。
 * DI ライブラリは使わない。依存はすべてここで引数として渡す。
 */
import type { Bindings } from './application/env';
import { log } from './application/logger';
import { nowUtcIso } from './datasource/clock';
import { webCryptoTokens } from './datasource/crypto';
import { createAttendanceRepository } from './datasource/d1/attendance';
import { createAuthRepository } from './datasource/d1/auth';
import { createEventRepository } from './datasource/d1/events';
import { createInvitationRepository } from './datasource/d1/invitations';
import { createMemberRepository } from './datasource/d1/members';
import { createSessionRepository } from './datasource/d1/sessions';
import { getDb } from './datasource/db/client';
import { newId } from './datasource/id';
import { getMailSender } from './datasource/mail';
import { pbkdf2Password } from './datasource/password';
import type { Usecases } from './usecase';
import { createAttendanceUsecase } from './usecase/attendance';
import { createAuthUsecase } from './usecase/auth';
import { createEventUsecase } from './usecase/events';
import { createInvitationUsecase } from './usecase/invitations';
import { createMemberUsecase } from './usecase/members';
import type { RequestLogger } from './usecase/ports';

/** APP_BASE_URL（末尾の / は除く）。未設定なら null */
export function appBaseUrl(env: Pick<Bindings, 'APP_BASE_URL'>): string | null {
  const base = env.APP_BASE_URL?.trim().replace(/\/+$/, '');
  return base ? base : null;
}

export function composeUsecases(env: Bindings, requestLog: RequestLogger): Usecases {
  const db = getDb(env.DB);
  const sessions = createSessionRepository(db);
  const common = { now: nowUtcIso, newId, tokens: webCryptoTokens, password: pbkdf2Password, log: requestLog };

  return {
    auth: createAuthUsecase({ ...common, auth: createAuthRepository(db), sessions }),
    events: createEventUsecase({ ...common, events: createEventRepository(db) }),
    attendance: createAttendanceUsecase({ ...common, attendances: createAttendanceRepository(db) }),
    invitations: createInvitationUsecase({
      ...common,
      invitations: createInvitationRepository(db),
      sessions,
      mail: getMailSender(env, log),
      appBaseUrl: appBaseUrl(env),
    }),
    members: createMemberUsecase({ ...common, members: createMemberRepository(db) }),
  };
}
