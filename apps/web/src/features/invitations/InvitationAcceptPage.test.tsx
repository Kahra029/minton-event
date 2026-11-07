import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeResponse } from '@minton/types';
import { queryKeys } from '@/lib/queryKeys';
import { renderRoute } from '@/test/render';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const me: MeResponse = {
  member: { id: 'm9', email: 'invitee@example.com', displayName: 'はなこ', role: 'member' },
  circle: { id: 'c1', circleLoginId: 'mon-bad', name: '月曜バド' },
};

afterEach(() => vi.unstubAllGlobals());

function fill(values: { displayName: string; password: string; passwordConfirmation: string }) {
  fireEvent.change(screen.getByLabelText('表示名'), { target: { value: values.displayName } });
  fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: values.password } });
  fireEvent.change(screen.getByLabelText('パスワード（確認）'), { target: { value: values.passwordConfirmation } });
  fireEvent.click(screen.getByRole('button', { name: '登録する' }));
}

describe('初回登録画面（AC-15 / AC-16）', () => {
  it('Circle 名と招待先 Email（表示のみ）を出し、登録後はログイン状態でイベント一覧へ', async () => {
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/invitations/tok-123' && !init?.method?.match(/POST/)) {
        return json(200, { circleName: '月曜バド', email: 'invitee@example.com' });
      }
      if (path === '/api/invitations/tok-123/accept') return json(201, me);
      return json(200, { events: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { router, queryClient } = renderRoute('/invitations/tok-123', { me: null });

    expect(await screen.findByText('月曜バド')).toBeInTheDocument();
    expect(screen.getByLabelText('招待先メールアドレス')).toHaveTextContent('invitee@example.com');
    // Email は入力できない（AC-16）
    expect(screen.queryByRole('textbox', { name: /メール/ })).not.toBeInTheDocument();

    fill({ displayName: 'はなこ', password: 'password123', passwordConfirmation: 'password123' });

    await waitFor(() => expect(router.state.location.pathname).toBe('/events'));
    expect(queryClient.getQueryData(queryKeys.me)).toEqual(me);
    const post = fetchMock.mock.calls.find(([p]) => p === '/api/invitations/tok-123/accept')!;
    expect(JSON.parse(post[1]!.body as string)).toEqual({
      displayName: 'はなこ',
      password: 'password123',
      passwordConfirmation: 'password123',
    });
  });

  it('無効な Token は「この招待URLは無効です」を表示しフォームを出さない（C11）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json(404, { error: { code: 'NOT_FOUND', message: 'この招待URLは無効です' } })),
    );
    renderRoute('/invitations/bad', { me: null });
    expect(await screen.findByRole('alert')).toHaveTextContent('この招待URLは無効です');
    expect(screen.queryByRole('button', { name: '登録する' })).not.toBeInTheDocument();
  });

  it('Password 確認が一致しなければ送信しない', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { circleName: '月曜バド', email: 'invitee@example.com' }));
    vi.stubGlobal('fetch', fetchMock);
    renderRoute('/invitations/tok-123', { me: null });
    await screen.findByText('月曜バド');
    fill({ displayName: 'はなこ', password: 'password123', passwordConfirmation: 'password999' });
    expect(await screen.findByText('パスワードが一致しません')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('登録時に Token が使えなくなっていたらエラーを表示する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) =>
        path.endsWith('/accept')
          ? json(404, { error: { code: 'NOT_FOUND', message: 'この招待URLは無効です' } })
          : json(200, { circleName: '月曜バド', email: 'invitee@example.com' }),
      ),
    );
    const { router } = renderRoute('/invitations/tok-123', { me: null });
    await screen.findByText('月曜バド');
    fill({ displayName: 'はなこ', password: 'password123', passwordConfirmation: 'password123' });
    expect(await screen.findByRole('alert')).toHaveTextContent('この招待URLは無効です');
    expect(router.state.location.pathname).toBe('/invitations/tok-123');
  });
});
