import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventDetailResponse, EventListResponse } from '@minton/types';
import { createQueryClient } from '@/app/queryClient';
import { queryKeys } from '@/lib/queryKeys';
import { AttendanceButtons, type AttendanceButtonsProps } from './AttendanceButtons';
import { applyToDetail, applyToList } from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const okResponse = (status: 'attending' | 'absent') =>
  json(200, { attendance: { eventId: 'e1', memberId: 'm1', status, updatedAt: '2026-11-07T00:00:00.000Z' } });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function setup(props: Partial<AttendanceButtonsProps> = {}) {
  const queryClient = createQueryClient();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AttendanceButtons eventId="e1" memberId="m1" currentStatus={null} {...props} />
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

const button = (name: '参加' | '不参加') => screen.getByRole('button', { name });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AttendanceButtons', () => {
  it('AC-21: 「参加」を 1 回クリックするだけで確認なしに PUT を送り、保存結果を表示する', async () => {
    const fetchMock = vi.fn(async () => okResponse('attending'));
    vi.stubGlobal('fetch', fetchMock);
    setup();

    expect(screen.getByText('未回答')).toBeInTheDocument();
    fireEvent.click(button('参加'));

    // 確認ダイアログを挟まない
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/events/e1/attendances/m1');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ status: 'attending' });

    await waitFor(() => expect(button('参加')).toHaveAttribute('aria-pressed', 'true'));
    expect(button('不参加')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('AC-21: 「不参加」も 1 回のクリックで保存される', async () => {
    const fetchMock = vi.fn(async () => okResponse('absent'));
    vi.stubGlobal('fetch', fetchMock);
    setup({ currentStatus: 'attending' });

    fireEvent.click(button('不参加'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ status: 'absent' });
    await waitFor(() => expect(button('不参加')).toHaveAttribute('aria-pressed', 'true'));
  });

  it('保存中は押した状態を先に表示する（楽観的更新）', async () => {
    const d = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => d.promise));
    setup();

    fireEvent.click(button('参加'));
    await waitFor(() => expect(button('参加')).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByText('参加', { selector: 'span' })).toBeInTheDocument();

    d.resolve(okResponse('attending'));
    await waitFor(() => expect(button('参加')).not.toBeDisabled());
    expect(button('参加')).toHaveAttribute('aria-pressed', 'true');
  });

  it('保存に失敗したら元の状態に戻し、エラーを表示する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(404, { error: { code: 'NOT_FOUND', message: 'イベントが見つかりません' } })),
    );
    setup({ currentStatus: 'absent' });

    fireEvent.click(button('参加'));
    expect(await screen.findByRole('alert')).toHaveTextContent('イベントが見つかりません');
    expect(button('不参加')).toHaveAttribute('aria-pressed', 'true');
    expect(button('参加')).toHaveAttribute('aria-pressed', 'false');
  });

  it('失敗時は一覧・詳細のキャッシュも元に戻す', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(500, { error: { code: 'INTERNAL_ERROR', message: 'x' } })));
    const { queryClient } = setup();
    const list = listData(null, 2);
    const detail = detailData(null);
    queryClient.setQueryData(queryKeys.events.list(), list);
    queryClient.setQueryData(queryKeys.events.detail('e1'), detail);

    fireEvent.click(button('参加'));
    await screen.findByRole('alert');
    expect(queryClient.getQueryData(queryKeys.events.list())).toEqual(list);
    expect(queryClient.getQueryData(queryKeys.events.detail('e1'))).toEqual(detail);
  });

  it('保存後に events のキャッシュを invalidate する（一覧・詳細の人数が更新される）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse('attending')));
    const { queryClient } = setup();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.click(button('参加'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.events.all }));
  });

  it('現在と同じ状態のボタンを押してもリクエストを送らない', async () => {
    const fetchMock = vi.fn(async () => okResponse('attending'));
    vi.stubGlobal('fetch', fetchMock);
    setup({ currentStatus: 'attending' });
    fireEvent.click(button('参加'));
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function detailData(myStatus: 'attending' | 'absent' | null): EventDetailResponse {
  const members = [
    { memberId: 'm1', displayName: 'A', status: myStatus },
    { memberId: 'm2', displayName: 'B', status: 'attending' as const },
    { memberId: 'm3', displayName: 'C', status: null },
  ];
  return {
    event: {
      id: 'e1',
      title: null,
      startAt: '2026-11-08T01:00:00.000Z',
      endAt: '2026-11-08T03:00:00.000Z',
      location: '体育館',
      createdAt: '2026-11-07T00:00:00.000Z',
      updatedAt: '2026-11-07T00:00:00.000Z',
      myStatus,
      counts: {
        attending: members.filter((m) => m.status === 'attending').length,
        absent: members.filter((m) => m.status === 'absent').length,
        unanswered: members.filter((m) => m.status === null).length,
      },
      members,
    },
  };
}

function listData(myStatus: 'attending' | 'absent' | null, attendingCount: number): EventListResponse {
  const { members: _m, counts: _c, ...base } = detailData(myStatus).event;
  return {
    events: [
      { ...base, myStatus, attendingCount },
      { ...base, id: 'e2', myStatus: null, attendingCount: 5 },
    ],
  };
}

describe('キャッシュの楽観的更新', () => {
  it('未回答 → 参加: 詳細の参加 +1 / 未回答 -1、自分の行も更新', () => {
    const next = applyToDetail(detailData(null), 'm1', 'attending')!;
    expect(next.event.myStatus).toBe('attending');
    expect(next.event.counts).toEqual({ attending: 2, absent: 0, unanswered: 1 });
    expect(next.event.members.find((m) => m.memberId === 'm1')?.status).toBe('attending');
  });

  it('参加 → 不参加: 詳細の参加 -1 / 不参加 +1（AC-09）', () => {
    const next = applyToDetail(detailData('attending'), 'm1', 'absent')!;
    expect(next.event.counts).toEqual({ attending: 1, absent: 1, unanswered: 1 });
  });

  it('一覧: 対象 Event だけ参加人数と自分の状態を更新する', () => {
    const toAttend = applyToList(listData(null, 1), 'e1', 'attending')!;
    expect(toAttend.events[0]).toMatchObject({ myStatus: 'attending', attendingCount: 2 });
    expect(toAttend.events[1]).toMatchObject({ myStatus: null, attendingCount: 5 });

    const toAbsent = applyToList(listData('attending', 2), 'e1', 'absent')!;
    expect(toAbsent.events[0]).toMatchObject({ myStatus: 'absent', attendingCount: 1 });

    const absentFromNull = applyToList(listData(null, 1), 'e1', 'absent')!;
    expect(absentFromNull.events[0]).toMatchObject({ myStatus: 'absent', attendingCount: 1 });
  });

  it('キャッシュが無ければ何もしない', () => {
    expect(applyToDetail(undefined, 'm1', 'attending')).toBeUndefined();
    expect(applyToList(undefined, 'e1', 'attending')).toBeUndefined();
  });
});
