import { NavLink, Outlet } from 'react-router-dom';
import { CalendarDays, Users } from 'lucide-react';
import { LogoutButton } from '@/features/auth/LogoutButton';
import { useMe } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

/**
 * ログイン後の画面の共通レイアウト（モバイルファースト: guardrails §12）。
 * - 幅は max-w-md で中央寄せ。横スクロールしない
 * - ヘッダーに Circle 名、ナビ（イベント / メンバー[admin のみ]）、ログアウト
 */
export function AppLayout() {
  const { data: me } = useMe();
  const isAdmin = me?.member.role === 'admin';
  const navClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'inline-flex h-11 items-center gap-1 rounded-md px-3 text-sm',
      isActive ? 'bg-secondary font-medium' : 'text-muted-foreground',
    );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex h-12 items-center justify-between gap-2">
          <span className="truncate font-semibold">{me?.circle.name}</span>
          <LogoutButton />
        </div>
        <nav className="flex gap-1 pb-2">
          <NavLink to={routes.events()} className={navClass}>
            <CalendarDays className="size-4" />
            イベント
          </NavLink>
          {isAdmin && (
            <NavLink to={routes.members()} className={navClass}>
              <Users className="size-4" />
              メンバー
            </NavLink>
          )}
        </nav>
      </header>
      <main className="flex-1 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
    </div>
  );
}
