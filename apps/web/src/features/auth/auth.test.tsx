import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiPaths, LOGIN_FAILED_MESSAGE, type EventListResponse, type MeResponse } from '@minton/types';
import { loadLastCircleLoginId, saveLastCircleLoginId } from '@/lib/lastCircle';
import { queryKeys } from '@/lib/queryKeys';
import { makeMe, renderRoute } from '@/test/render';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const me: MeResponse = {
  member: { id: 'm1', email: 'user@example.com', displayName: 'テスト', role: 'member' },
  circle: { id: 'c1', circleLoginId: 'circle-a', name: 'サークルA' },
};

const emptyEventList: EventListResponse = { events: [] };

/** handler が返さない API は、イベント一覧（T2 の画面）なら契約どおりの空一覧、それ以外は空配列を返す */
function stubFetch(handler: (url: string, init: RequestInit) => Response | undefined) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    return handler(url, init) ?? (url === apiPaths.events.list ? json(200, emptyEventList) : json(200, []));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('メールアドレス'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'ログイン' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LoginPage（/login/:circleLoginId）', () => {
  it('AC-01: 正しい Email / Password でログインするとイベント一覧へ遷移し、circleLoginId を保存する', async () => {
    const fetchMock = stubFetch((url) => (url === '/api/auth/login' ? json(200, me) : undefined));
    const { router, queryClient } = renderRoute('/login/circle-a', { me: null });

    fillAndSubmit('user@example.com', 'password1234');

    await waitFor(() => expect(router.state.location.pathname).toBe('/events'));
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u) === '/api/auth/login')!;
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      circleLoginId: 'circle-a',
      email: 'user@example.com',
      password: 'password1234',
    });
    expect(queryClient.getQueryData(queryKeys.me)).toEqual(me);
    expect(loadLastCircleLoginId()).toBe('circle-a');
    expect(await screen.findByText('サークルA')).toBeInTheDocument();
  });

  it('401 のときは統一文言を表示し、ログイン画面に留まる', async () => {
    stubFetch((url) =>
      url === '/api/auth/login' ? json(401, { error: { code: 'UNAUTHORIZED', message: LOGIN_FAILED_MESSAGE } }) : undefined,
    );
    const { router } = renderRoute('/login/circle-a', { me: null });

    fillAndSubmit('user@example.com', 'wrong-password');

    expect(await screen.findByRole('alert')).toHaveTextContent('メールアドレスまたはパスワードが違います');
    expect(router.state.location.pathname).toBe('/login/circle-a');
  });

  it('存在しない circleLoginId（404）はエラーを表示する', async () => {
    stubFetch((url) =>
      url === '/api/auth/login'
        ? json(404, { error: { code: 'NOT_FOUND', message: 'サークルが見つかりません' } })
        : undefined,
    );
    renderRoute('/login/unknown', { me: null });
    fillAndSubmit('user@example.com', 'password1234');
    expect(await screen.findByRole('alert')).toHaveTextContent('サークルが見つかりません');
  });

  it('入力が不正なら API を呼ばずにエラーを表示する', async () => {
    const fetchMock = stubFetch(() => undefined);
    renderRoute('/login/circle-a', { me: null });
    fillAndSubmit('not-an-email', '');
    expect(await screen.findByText('メールアドレスの形式が正しくありません')).toBeInTheDocument();
    expect(screen.getByText('パスワードを入力してください')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/login', expect.anything());
  });
});

describe('LogoutButton', () => {
  it('B9: ログアウトすると API を呼び、/login/<最後の circleLoginId> へ戻る', async () => {
    saveLastCircleLoginId('test-circle');
    const fetchMock = stubFetch((url) => (url === '/api/auth/logout' ? new Response(null, { status: 204 }) : undefined));
    const { router, queryClient } = renderRoute('/events', { me: makeMe() });

    fireEvent.click(await screen.findByRole('button', { name: 'ログアウト' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login/test-circle'));
    expect(fetchMock.mock.calls.some(([u, init]) => String(u) === '/api/auth/logout' && init?.method === 'POST')).toBe(
      true,
    );
    expect(queryClient.getQueryData(queryKeys.me)).toBeNull();
  });

  it('ログアウトに失敗したらエラーを表示し、ログイン状態のまま', async () => {
    stubFetch((url) =>
      url === '/api/auth/logout'
        ? json(500, { error: { code: 'INTERNAL_ERROR', message: 'サーバーでエラーが発生しました' } })
        : undefined,
    );
    const { router } = renderRoute('/events', { me: makeMe() });
    fireEvent.click(await screen.findByRole('button', { name: 'ログアウト' }));
    expect(await screen.findByText('ログアウトに失敗しました')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/events');
  });
});
