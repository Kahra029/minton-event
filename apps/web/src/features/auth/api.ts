import { useMutation } from '@tanstack/react-query';
import { apiPaths, type LoginRequest, type MeResponse } from '@minton/types';
import { api } from '@/lib/api';
import { useSetLoggedIn, useSetLoggedOut } from '@/lib/auth';

/** POST /api/auth/login。成功時に me を更新し circleLoginId を保存する（C2） */
export function useLogin() {
  const setLoggedIn = useSetLoggedIn();
  return useMutation({
    mutationFn: (input: LoginRequest) => api.post<MeResponse>(apiPaths.auth.login, input),
    onSuccess: (me) => setLoggedIn(me),
  });
}

/** POST /api/auth/logout。成功時にキャッシュを消し、RequireAuth がログイン画面へ送る */
export function useLogout() {
  const setLoggedOut = useSetLoggedOut();
  return useMutation({
    mutationFn: () => api.post<void>(apiPaths.auth.logout),
    onSuccess: () => setLoggedOut(),
  });
}
