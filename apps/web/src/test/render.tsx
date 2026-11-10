/**
 * web のテスト用ヘルパー。
 *   renderRoute('/events', { me: adminMe })  … 実際のルーター定義で指定パスを描画する
 * me を渡すと GET /api/auth/me を叩かずにログイン状態にする（null = 未ログイン）。
 * API を呼ぶ画面のテストでは vi.stubGlobal('fetch', ...) で fetch を差し替える。
 */
import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { MeResponse } from '@minton/types';
import { createQueryClient } from '@/app/queryClient';
import { routeObjects } from '@/app/router';
import { queryKeys } from '@/lib/queryKeys';

export function renderRoute(path: string, options: { me?: MeResponse | null } = {}) {
  const queryClient = createQueryClient();
  if (options.me !== undefined) queryClient.setQueryData(queryKeys.me, options.me);
  const router = createMemoryRouter(routeObjects, { initialEntries: [path] });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, router, queryClient };
}

export const makeMe = (role: 'admin' | 'member' = 'member'): MeResponse => ({
  member: { id: 'm1', email: 'user@example.com', displayName: 'テスト', role },
  circle: { id: 'c1', circleLoginId: 'test-circle', name: 'テストサークル' },
});
