/** application が c.var.usecases から使う usecase の一覧（組み立ては composition.ts） */
import type { AttendanceUsecase } from './attendance';
import type { AuthUsecase } from './auth';
import type { EventUsecase } from './events';
import type { InvitationUsecase } from './invitations';
import type { MemberUsecase } from './members';

export type Usecases = {
  auth: AuthUsecase;
  events: EventUsecase;
  attendance: AttendanceUsecase;
  invitations: InvitationUsecase;
  members: MemberUsecase;
};
