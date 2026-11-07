/**
 * Event の API hooks（担当: T2）。
 * 変更系の成功後は queryKeys.events.all を invalidate して一覧・詳細を最新にする。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  apiPaths,
  type CreateEventRequest,
  type EventDetailResponse,
  type EventListResponse,
  type EventResponse,
  type UpdateEventRequest,
} from '@minton/types';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

export function useEventList() {
  return useQuery({
    queryKey: queryKeys.events.list(),
    queryFn: ({ signal }) => api.get<EventListResponse>(apiPaths.events.list, signal),
  });
}

export function useEventDetail(eventId: string) {
  return useQuery({
    queryKey: queryKeys.events.detail(eventId),
    queryFn: ({ signal }) => api.get<EventDetailResponse>(apiPaths.events.detail(eventId), signal),
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEventRequest) => api.post<EventResponse>(apiPaths.events.create, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.events.all }),
  });
}

export function useUpdateEvent(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateEventRequest) => api.put<EventResponse>(apiPaths.events.detail(eventId), body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.events.all }),
  });
}

export function useDeleteEvent(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(apiPaths.events.detail(eventId)),
    // 削除直後は編集画面がまだ詳細を購読しているので、詳細は再取得させない（一覧のみ invalidate）。
    // 削除済みの詳細を後で開くと再取得で 404 になり「見つかりません」を表示する。
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.events.list() }),
  });
}
