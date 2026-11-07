import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventDetail, EventListItem } from '@minton/types';
import { makeMe, renderRoute } from '@/test/render';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;

/** "METHOD path" → handler で fetch を差し替える。呼び出しは calls に記録する */
function stubApi(handlers: Record<string, Handler>) {
  const calls: { key: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path}`;
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const handler = handlers[key];
    if (!handler) return json(404, { error: { code: 'NOT_FOUND', message: '見つかりません' } });
    return handler(init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const listItem = (overrides: Partial<EventListItem> = {}): EventListItem => ({
  id: 'e1',
  title: '定例練習',
  startAt: '2099-11-07T10:00:00.000Z', // JST 19:00
  endAt: '2099-11-07T12:00:00.000Z', // JST 21:00
  location: '市民体育館',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  myStatus: null,
  attendingCount: 0,
  ...overrides,
});

const detail = (overrides: Partial<EventDetail> = {}): EventDetail => ({
  ...listItem(),
  myStatus: 'absent',
  counts: { attending: 1, absent: 1, unanswered: 1 },
  members: [
    { memberId: 'm2', displayName: 'Alice', status: 'attending' },
    { memberId: 'm3', displayName: 'Bob', status: null },
    { memberId: 'm1', displayName: 'テスト', status: 'absent' },
  ],
  ...overrides,
});

describe('イベント一覧（AC-05）', () => {
  it('開催日時（JST）・場所・自分の出欠・参加人数を API の順に表示する', async () => {
    stubApi({
      'GET /api/events': () =>
        json(200, {
          events: [
            listItem({ id: 'e1', myStatus: 'attending', attendingCount: 3 }),
            listItem({ id: 'e2', title: null, location: '県立体育館', myStatus: null, attendingCount: 0 }),
          ],
        }),
    });
    renderRoute('/events', { me: makeMe('member') });

    const links = await screen.findAllByRole('link', { name: /体育館/ });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/events/e1');
    expect(within(links[0]).getByRole('heading', { name: '定例練習' })).toBeInTheDocument();
    expect(links[0]).toHaveTextContent('11/7(土) 19:00〜21:00');
    expect(links[0]).toHaveTextContent('市民体育館');
    expect(links[0]).toHaveTextContent('自分: 参加');
    expect(links[0]).toHaveTextContent('参加 3人');

    // Title 未入力は日時を見出しにする（B6）
    expect(within(links[1]).getByRole('heading', { name: '11/7(土) 19:00〜21:00' })).toBeInTheDocument();
    expect(links[1]).toHaveTextContent('県立体育館');
    expect(links[1]).toHaveTextContent('自分: 未回答');
    expect(links[1]).toHaveTextContent('参加 0人');
  });

  it('Event が無ければその旨を表示する', async () => {
    stubApi({ 'GET /api/events': () => json(200, { events: [] }) });
    renderRoute('/events', { me: makeMe('member') });
    expect(await screen.findByText('予定されているイベントはありません')).toBeInTheDocument();
  });

  it('admin には作成ボタンを表示する', async () => {
    stubApi({ 'GET /api/events': () => json(200, { events: [] }) });
    renderRoute('/events', { me: makeMe('admin') });
    expect(await screen.findByRole('link', { name: 'イベント作成' })).toHaveAttribute('href', '/events/new');
  });

  it('member には作成ボタンを表示しない（AC-04）', async () => {
    stubApi({ 'GET /api/events': () => json(200, { events: [] }) });
    renderRoute('/events', { me: makeMe('member') });
    await screen.findByText('予定されているイベントはありません');
    expect(screen.queryByRole('link', { name: 'イベント作成' })).not.toBeInTheDocument();
  });
});

describe('イベント詳細（AC-06 / AC-10）', () => {
  it('日時・場所・自分の出欠・参加/不参加/未回答人数・各 Member の出欠を表示する', async () => {
    stubApi({ 'GET /api/events/e1': () => json(200, { event: detail() }) });
    renderRoute('/events/e1', { me: makeMe('member') });

    expect(await screen.findByRole('heading', { name: '定例練習' })).toBeInTheDocument();
    expect(screen.getByText('11/7(土) 19:00〜21:00')).toBeInTheDocument();
    expect(screen.getByText('市民体育館')).toBeInTheDocument();
    expect(screen.getByTestId('my-status')).toHaveTextContent('不参加');
    expect(screen.getByLabelText('参加 1人')).toBeInTheDocument();
    expect(screen.getByLabelText('不参加 1人')).toBeInTheDocument();
    expect(screen.getByLabelText('未回答 1人')).toBeInTheDocument();

    const rows = within(screen.getByRole('region', { name: 'メンバーの出欠' })).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual(['Alice参加', 'Bob未回答', 'テスト（自分）不参加']);
  });

  it('Title 未入力は日時を見出しにする（B6）', async () => {
    stubApi({ 'GET /api/events/e1': () => json(200, { event: detail({ title: null }) }) });
    renderRoute('/events/e1', { me: makeMe('member') });
    expect(await screen.findByRole('heading', { level: 1, name: '11/7(土) 19:00〜21:00' })).toBeInTheDocument();
  });

  it('admin には編集への導線を出し、member には出さない', async () => {
    stubApi({ 'GET /api/events/e1': () => json(200, { event: detail() }) });
    const { unmount } = renderRoute('/events/e1', { me: makeMe('admin') });
    expect(await screen.findByRole('link', { name: '編集' })).toHaveAttribute('href', '/events/e1/edit');
    unmount();

    renderRoute('/events/e1', { me: makeMe('member') });
    await screen.findByRole('heading', { name: '定例練習' });
    expect(screen.queryByRole('link', { name: '編集' })).not.toBeInTheDocument();
  });

  it('404（別 Circle・削除済み）は「イベントが見つかりません」（AC-12）', async () => {
    stubApi({});
    renderRoute('/events/other', { me: makeMe('member') });
    expect(await screen.findByText('イベントが見つかりません')).toBeInTheDocument();
  });
});

describe('イベント作成（AC-03）', () => {
  it('JST の入力を UTC にして送り、作成後はイベント詳細へ遷移する', async () => {
    const calls = stubApi({
      'POST /api/events': () => json(201, { event: listItem({ id: 'new1' }) }),
      'GET /api/events/new1': () => json(200, { event: detail({ id: 'new1' }) }),
    });
    const { router } = renderRoute('/events/new', { me: makeMe('admin') });

    fireEvent.change(await screen.findByLabelText('開始日時'), { target: { value: '2099-11-07T19:00' } });
    fireEvent.change(screen.getByLabelText('終了日時'), { target: { value: '2099-11-07T21:00' } });
    fireEvent.change(screen.getByLabelText('場所'), { target: { value: '市民体育館' } });
    fireEvent.click(screen.getByRole('button', { name: '作成する' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/events/new1'));
    expect(calls.find((c) => c.key === 'POST /api/events')?.body).toEqual({
      title: '',
      startAt: '2099-11-07T10:00:00.000Z',
      endAt: '2099-11-07T12:00:00.000Z',
      location: '市民体育館',
    });
  });

  it('終了 <= 開始・場所未入力は送信せずにエラーを表示する（B13）', async () => {
    const calls = stubApi({});
    renderRoute('/events/new', { me: makeMe('admin') });

    fireEvent.change(await screen.findByLabelText('開始日時'), { target: { value: '2099-11-07T19:00' } });
    fireEvent.change(screen.getByLabelText('終了日時'), { target: { value: '2099-11-07T19:00' } });
    fireEvent.click(screen.getByRole('button', { name: '作成する' }));

    expect(await screen.findByText('終了日時は開始日時より後にしてください')).toBeInTheDocument();
    expect(screen.getByText('場所を入力してください')).toBeInTheDocument();
    expect(calls.filter((c) => c.key === 'POST /api/events')).toHaveLength(0);
  });

  it('API の 403 はフォーム上部に表示する', async () => {
    stubApi({
      'POST /api/events': () => json(403, { error: { code: 'FORBIDDEN', message: 'この操作を行う権限がありません' } }),
    });
    renderRoute('/events/new', { me: makeMe('admin') });
    fireEvent.change(await screen.findByLabelText('開始日時'), { target: { value: '2099-11-07T19:00' } });
    fireEvent.change(screen.getByLabelText('終了日時'), { target: { value: '2099-11-07T21:00' } });
    fireEvent.change(screen.getByLabelText('場所'), { target: { value: '体育館' } });
    fireEvent.click(screen.getByRole('button', { name: '作成する' }));
    expect(await screen.findByText('この操作を行う権限がありません')).toBeInTheDocument();
  });
});

describe('イベント編集（AC-18 / AC-19）', () => {
  it('現在の値（JST）を初期値にし、保存すると PUT して詳細へ遷移する', async () => {
    const calls = stubApi({
      'GET /api/events/e1': () => json(200, { event: detail() }),
      'PUT /api/events/e1': () => json(200, { event: listItem({ location: '県立体育館' }) }),
    });
    const { router } = renderRoute('/events/e1/edit', { me: makeMe('admin') });

    const start = (await screen.findByLabelText('開始日時')) as HTMLInputElement;
    expect(start.value).toBe('2099-11-07T19:00');
    expect((screen.getByLabelText('終了日時') as HTMLInputElement).value).toBe('2099-11-07T21:00');
    expect((screen.getByLabelText('場所') as HTMLInputElement).value).toBe('市民体育館');
    expect((screen.getByLabelText(/タイトル/) as HTMLInputElement).value).toBe('定例練習');

    fireEvent.change(screen.getByLabelText('場所'), { target: { value: '県立体育館' } });
    fireEvent.change(screen.getByLabelText('終了日時'), { target: { value: '2099-11-07T22:30' } });
    fireEvent.click(screen.getByRole('button', { name: '保存する' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/events/e1'));
    expect(calls.find((c) => c.key === 'PUT /api/events/e1')?.body).toEqual({
      title: '定例練習',
      startAt: '2099-11-07T10:00:00.000Z',
      endAt: '2099-11-07T13:30:00.000Z',
      location: '県立体育館',
    });
  });

  it('API の fieldErrors は該当フィールドに表示する', async () => {
    stubApi({
      'GET /api/events/e1': () => json(200, { event: detail() }),
      'PUT /api/events/e1': () =>
        json(400, {
          error: {
            code: 'VALIDATION_ERROR',
            message: '入力内容に誤りがあります',
            details: { formErrors: [], fieldErrors: { location: ['サーバーで拒否された場所'] } },
          },
        }),
    });
    renderRoute('/events/e1/edit', { me: makeMe('admin') });
    await screen.findByLabelText('開始日時');
    fireEvent.click(screen.getByRole('button', { name: '保存する' }));
    expect(await screen.findByText('サーバーで拒否された場所')).toBeInTheDocument();
  });

  it('削除は確認ダイアログを経て DELETE し、一覧へ遷移する。キャンセルでは削除しない', async () => {
    const calls = stubApi({
      'GET /api/events/e1': () => json(200, { event: detail() }),
      'DELETE /api/events/e1': () => new Response(null, { status: 204 }),
      'GET /api/events': () => json(200, { events: [] }),
    });
    const { router } = renderRoute('/events/e1/edit', { me: makeMe('admin') });

    fireEvent.click(await screen.findByRole('button', { name: 'このイベントを削除' }));
    const dialog = await screen.findByRole('dialog', { name: 'イベントを削除しますか？' });
    expect(dialog).toHaveTextContent('「定例練習」を削除します');
    fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.filter((c) => c.key === 'DELETE /api/events/e1')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'このイベントを削除' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '削除する' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/events'));
    expect(calls.filter((c) => c.key === 'DELETE /api/events/e1')).toHaveLength(1);
    expect(await screen.findByText('予定されているイベントはありません')).toBeInTheDocument();
  });

  it('member が編集画面を開いても表示しない（API でも 403）', async () => {
    const calls = stubApi({});
    renderRoute('/events/e1/edit', { me: makeMe('member') });
    expect(await screen.findByText('この画面を表示する権限がありません')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
