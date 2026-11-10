import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  apiPaths,
  type CreateInvitationRequest,
  type CreateInvitationResponse,
  type MemberListResponse,
} from '@minton/types';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

/** GET /api/members（admin のみ） */
export function useMemberList() {
  return useQuery({
    queryKey: queryKeys.members.list(),
    queryFn: ({ signal }) => api.get<MemberListResponse>(apiPaths.members.list, signal),
  });
}

/** POST /api/invitations（admin のみ）。成功したらメンバー一覧を更新する */
export function useCreateInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInvitationRequest) =>
      api.post<CreateInvitationResponse>(apiPaths.invitations.create, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.members.all }),
  });
}
