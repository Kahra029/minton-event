/**
 * メンバー一覧（/members、admin のみ）。招待フォームもここに置く。
 * 担当: T4。登録済み Member と未登録の Invitation（招待中 / 期限切れ）を表示する（AC-13 / C6）。
 */
import { Badge } from '@/components/ui/badge';
import { errorMessage } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/datetime';
import { InviteForm } from './InviteForm';
import { useMemberList } from './api';

const ROLE_LABEL = { admin: '管理者', member: 'メンバー' } as const;

export function MemberListPage() {
  const list = useMemberList();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">メンバー一覧</h1>
      <InviteForm />

      {list.isPending && <p className="text-sm text-muted-foreground">読み込み中…</p>}
      {list.isError && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(list.error)}
        </p>
      )}

      {list.data && (
        <>
          {list.data.invitations.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">招待中</h2>
              <ul className="divide-y rounded-xl border" aria-label="招待中の一覧">
                {list.data.invitations.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{i.email}</p>
                      <p className="text-xs text-muted-foreground">
                        有効期限 {formatDate(i.expiresAt)} {formatTime(i.expiresAt)}
                      </p>
                    </div>
                    {i.status === 'pending' ? (
                      <Badge variant="secondary">招待中</Badge>
                    ) : (
                      <Badge variant="destructive">期限切れ</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">登録済み（{list.data.members.length}人）</h2>
            <ul className="divide-y rounded-xl border" aria-label="登録済みメンバーの一覧">
              {list.data.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Badge variant={m.role === 'admin' ? 'default' : 'outline'}>{ROLE_LABEL[m.role]}</Badge>
                    <Badge variant="outline">登録済み</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
