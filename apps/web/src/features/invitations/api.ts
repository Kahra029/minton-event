import { useMutation, useQuery } from '@tanstack/react-query';
import { apiPaths, type AcceptInvitationRequest, type InvitationInfoResponse, type MeResponse } from '@minton/types';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

/** GET /api/invitations/:token（ログイン不要。無効な Token は 404: C11） */
export function useInvitationInfo(token: string) {
  return useQuery({
    queryKey: queryKeys.invitations.info(token),
    queryFn: ({ signal }) => api.get<InvitationInfoResponse>(apiPaths.invitations.info(token), signal),
  });
}

/** POST /api/invitations/:token/accept → MeResponse + Session Cookie（C9） */
export function useAcceptInvitation(token: string) {
  return useMutation({
    mutationFn: (body: AcceptInvitationRequest) => api.post<MeResponse>(apiPaths.invitations.accept(token), body),
  });
}
