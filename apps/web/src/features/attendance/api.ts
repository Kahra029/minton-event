import { useMutation, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import {
  apiPaths,
  type AttendanceResponse,
  type AttendanceStatus,
  type EventDetailResponse,
  type EventListResponse,
  type UpsertAttendanceRequest,
} from '@minton/types';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

type Status = AttendanceStatus | null;

/** Event 詳細のキャッシュに自分の出欠変更を反映する（人数・自分の状態・メンバー一覧） */
export function applyToDetail(
  data: EventDetailResponse | undefined,
  memberId: string,
  next: AttendanceStatus,
): EventDetailResponse | undefined {
  if (!data) return data;
  const prev: Status = data.event.myStatus;
  if (prev === next) return data;
  const counts = { ...data.event.counts };
  if (prev === null) counts.unanswered = Math.max(0, counts.unanswered - 1);
  else counts[prev] = Math.max(0, counts[prev] - 1);
  counts[next] += 1;
  return {
    event: {
      ...data.event,
      myStatus: next,
      counts,
      members: data.event.members.map((m) => (m.memberId === memberId ? { ...m, status: next } : m)),
    },
  };
}

/** Event 一覧のキャッシュに自分の出欠変更を反映する（参加人数・自分の状態） */
export function applyToList(
  data: EventListResponse | undefined,
  eventId: string,
  next: AttendanceStatus,
): EventListResponse | undefined {
  if (!data) return data;
  return {
    events: data.events.map((e) => {
      if (e.id !== eventId || e.myStatus === next) return e;
      const delta = (next === 'attending' ? 1 : 0) - (e.myStatus === 'attending' ? 1 : 0);
      return { ...e, myStatus: next, attendingCount: Math.max(0, e.attendingCount + delta) };
    }),
  };
}

type Snapshot = Array<[QueryKey, unknown]>;

function snapshot(queryClient: QueryClient, eventId: string): Snapshot {
  return [
    [queryKeys.events.list(), queryClient.getQueryData(queryKeys.events.list())],
    [queryKeys.events.detail(eventId), queryClient.getQueryData(queryKeys.events.detail(eventId))],
  ];
}

/**
 * 自分の出欠を保存する（PUT /api/events/:eventId/attendances/:memberId）。
 * - 楽観的更新: 一覧・詳細のキャッシュを即座に書き換え、失敗したら元に戻す
 * - 完了後（成功・失敗とも）に queryKeys.events.all を invalidate してサーバーの値で更新する
 */
export function useUpsertAttendance(eventId: string, memberId: string) {
  const queryClient = useQueryClient();
  return useMutation<AttendanceResponse, unknown, UpsertAttendanceRequest, { previous: Snapshot }>({
    mutationFn: (body) => api.put<AttendanceResponse>(apiPaths.attendance.upsert(eventId, memberId), body),
    onMutate: async ({ status }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.events.all });
      const previous = snapshot(queryClient, eventId);
      queryClient.setQueryData<EventListResponse>(queryKeys.events.list(), (d) => applyToList(d, eventId, status));
      queryClient.setQueryData<EventDetailResponse>(queryKeys.events.detail(eventId), (d) =>
        applyToDetail(d, memberId, status),
      );
      return { previous };
    },
    onError: (_e, _vars, context) => {
      for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.events.all }),
  });
}
