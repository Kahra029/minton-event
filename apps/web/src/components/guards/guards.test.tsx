import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { saveLastCircleLoginId } from '@/lib/lastCircle';
import { makeMe, renderRoute } from '@/test/render';

describe('RequireAuth（decisions C2）', () => {
  it('未ログインで保存済みの circleLoginId があれば /login/<保存値> へ', async () => {
    saveLastCircleLoginId('my-circle');
    const { router } = renderRoute('/events', { me: null });
    expect(await screen.findByRole('heading', { name: 'ログイン' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login/my-circle');
  });

  it('未ログインで保存値が無ければ案内画面へ', async () => {
    const { router } = renderRoute('/events', { me: null });
    expect(await screen.findByText('ログインURLを確認してください')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('ログイン済みならページを表示する', async () => {
    renderRoute('/events', { me: makeMe() });
    expect(await screen.findByRole('heading', { name: 'イベント一覧' })).toBeInTheDocument();
  });
});

describe('RequireAdmin', () => {
  it.each(['/events/new', '/events/e1/edit', '/members'])('member が %s を開くと権限なしの表示', async (path) => {
    renderRoute(path, { me: makeMe('member') });
    expect(await screen.findByText('この画面を表示する権限がありません')).toBeInTheDocument();
  });

  it('admin はメンバー一覧を表示でき、ナビにメンバーが出る', async () => {
    renderRoute('/members', { me: makeMe('admin') });
    expect(await screen.findByRole('heading', { name: 'メンバー一覧' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /メンバー/ })).toBeInTheDocument();
  });

  it('member のナビにはメンバーが出ない', async () => {
    renderRoute('/events', { me: makeMe('member') });
    await screen.findByRole('heading', { name: 'イベント一覧' });
    expect(screen.queryByRole('link', { name: /メンバー/ })).not.toBeInTheDocument();
  });
});
