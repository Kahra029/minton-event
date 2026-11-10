import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/api';
import { markLoggedOut } from '@/lib/auth';

/**
 * どの API でも 401 が返ったら Session 切れとみなし、ログアウト状態にする
 * （RequireAuth がログイン画面へリダイレクトする）。
 */
export function createQueryClient(): QueryClient {
  const onError = (e: unknown) => {
    if (isApiError(e, 'UNAUTHORIZED')) markLoggedOut(queryClient);
  };
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        retry: (count, e) => !isApiError(e) && count < 2,
        refetchOnWindowFocus: false,
      },
    },
  });
  return queryClient;
}
