import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MemberListResponse } from '@minton/types';
import { makeMe, renderRoute } from '@/test/render';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const listBody: MemberListResponse = {
  members: [
    { id: 'm1', email: 'admin@example.com', displayName: '管理者', role: 'admin', createdAt: '2026-11-01T00:00:00.000Z' },
    { id: 'm2', email: 'taro@example.com', displayName: 'たろう', role: 'member', createdAt: '2026-11-01T00:00:00.000Z' },
  ],
  invitations: [
    { id: 'i1', email: 'new@example.com', status: 'pending', expiresAt: '2026-11-14T00:00:00.000Z', createdAt: '2026-11-07T00:00:00.000Z' },
    { id: 'i2', email: 'old@example.com', status: 'expired', expiresAt: '2026-11-01T00:00:00.000Z', createdAt: '2026-10-25T00:00:00.000Z' },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('メンバー一覧（AC-13）', () => {
  it('Display Name・Email・Role・登録状態 / 招待状態を表示する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, listBody)));
    renderRoute('/members', { me: makeMe('admin') });

    const members = await screen.findByRole('list', { name: '登録済みメンバーの一覧' });
    expect(within(members).getByText('たろう')).toBeInTheDocument();
    expect(within(members).getByText('taro@example.com')).toBeInTheDocument();
    expect(within(members).getByText('管理者', { selector: '[data-slot="badge"]' })).toBeInTheDocument();
    expect(within(members).getAllByText('登録済み')).toHaveLength(2);

    const invitations = screen.getByRole('list', { name: '招待中の一覧' });
    expect(within(invitations).getByText('new@example.com')).toBeInTheDocument();
    expect(within(invitations).getByText('招待中')).toBeInTheDocument();
    expect(within(invitations).getByText('期限切れ')).toBeInTheDocument();
  });

  const INVITATION_URL = 'http://localhost:5173/invitations/secret-token';

  it('招待フォームから送信すると POST して一覧を再取得し、招待 URL とコピーボタンを表示する（C31）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return json(201, {
          invitation: { id: 'i3', email: 'hanako@example.com', status: 'pending', expiresAt: '2026-11-14T00:00:00.000Z', createdAt: '2026-11-07T00:00:00.000Z' },
          invitationUrl: INVITATION_URL,
        });
      }
      expect(path).toBe('/api/members');
      return json(200, listBody);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderRoute('/members', { me: makeMe('admin') });
    await screen.findByText('たろう');

    fireEvent.change(screen.getByLabelText('招待するメールアドレス'), { target: { value: 'hanako@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '招待する' }));

    expect(await screen.findByText('hanako@example.com の招待URLを作成しました')).toBeInTheDocument();
    expect(screen.getByLabelText('招待URL')).toHaveValue(INVITATION_URL);
    expect(screen.getByText('この URL は再表示できません。コピーして本人に渡してください')).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(post[0]).toBe('/api/invitations');
    expect(JSON.parse(post[1]!.body as string)).toEqual({ email: 'hanako@example.com' });
    await waitFor(() => expect(fetchMock.mock.calls.filter(([p]) => p === '/api/members')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: 'コピー' }));
    expect(await screen.findByRole('button', { name: 'コピーしました' })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(INVITATION_URL);
  });

  it('既存 Member の Email なら API のエラー（409）を表示する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_path: string, init?: RequestInit) =>
        init?.method === 'POST'
          ? json(409, { error: { code: 'CONFLICT', message: 'このメールアドレスのメンバーは既に登録されています' } })
          : json(200, listBody),
      ),
    );
    renderRoute('/members', { me: makeMe('admin') });
    await screen.findByText('たろう');
    fireEvent.change(screen.getByLabelText('招待するメールアドレス'), { target: { value: 'taro@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '招待する' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('このメールアドレスのメンバーは既に登録されています');
  });

  it('Email の形式が不正なら送信しない', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, listBody));
    vi.stubGlobal('fetch', fetchMock);
    renderRoute('/members', { me: makeMe('admin') });
    await screen.findByText('たろう');
    fireEvent.change(screen.getByLabelText('招待するメールアドレス'), { target: { value: 'not-email' } });
    fireEvent.click(screen.getByRole('button', { name: '招待する' }));
    expect(await screen.findByText('メールアドレスの形式が正しくありません')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });
});

describe('AC-14: member には招待 UI を表示しない', () => {
  it('member が /members を開いても招待フォームは出ず、API も呼ばない', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderRoute('/members', { me: makeMe('member') });
    expect(await screen.findByText('この画面を表示する権限がありません')).toBeInTheDocument();
    expect(screen.queryByLabelText('招待するメールアドレス')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
