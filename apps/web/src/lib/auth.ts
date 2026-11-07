/**
 * ログイン状態（GET /api/auth/me）。
 * - useMe(): MeResponse | null（null = 未ログイン）
 * - useSetLoggedIn(): ログイン / 招待からの初回登録（C9）の成功時に呼ぶ。me を更新し circleLoginId を保存する
 * - useSetLoggedOut(): ログアウト成功時に呼ぶ。キャッシュを消す
 * どこかの API が 401 を返したら main.tsx の QueryCache / MutationCache が me を null にし、RequireAuth がログイン画面へ送る。
 */
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { apiPaths, type MeResponse } from '@minton/types';
import { api, isApiError } from './api';
import { saveLastCircleLoginId } from './lastCircle';
import { queryKeys } from './queryKeys';

export async function fetchMe(): Promise<MeResponse | null> {
  try {
    return await api.get<MeResponse>(apiPaths.auth.me);
  } catch (e) {
    if (isApiError(e, 'UNAUTHORIZED')) return null;
    throw e;
  }
}

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: fetchMe, staleTime: Infinity });
}

export function markLoggedOut(queryClient: QueryClient) {
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.me[0] });
  queryClient.setQueryData(queryKeys.me, null);
}

export function useSetLoggedIn() {
  const queryClient = useQueryClient();
  return useCallback(
    (me: MeResponse) => {
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.me[0] });
      queryClient.setQueryData(queryKeys.me, me);
      saveLastCircleLoginId(me.circle.circleLoginId);
    },
    [queryClient],
  );
}

export function useSetLoggedOut() {
  const queryClient = useQueryClient();
  return useCallback(() => markLoggedOut(queryClient), [queryClient]);
}
