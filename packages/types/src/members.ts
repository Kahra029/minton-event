import { z } from 'zod';
import { idSchema, roleSchema } from './common';
import { invitationSchema } from './invitations';

/**
 * GET /api/members（admin のみ。member は 403）→ 200 MemberListResponse（decisions C6）
 * - members: 登録済み Member（Display Name 昇順）
 * - invitations: 未登録の Invitation（pending / expired）。accepted・revoked は含めない
 */
export const memberSchema = z.object({
  id: idSchema,
  email: z.string(),
  displayName: z.string(),
  role: roleSchema,
  createdAt: z.string(),
});
export type Member = z.infer<typeof memberSchema>;

export const memberListResponseSchema = z.object({
  members: z.array(memberSchema),
  invitations: z.array(invitationSchema),
});
export type MemberListResponse = z.infer<typeof memberListResponseSchema>;
