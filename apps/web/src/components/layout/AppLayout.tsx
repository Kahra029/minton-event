import { Link, Outlet, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useMe } from '@/lib/auth';
import { HeaderMenu } from './HeaderMenu';
import { upTarget } from './upTarget';

/**
 * ログイン後の画面の共通レイアウト（モバイルファースト: guardrails §12、decisions C39）。
 * - 幅は max-w-md で中央寄せ。横スクロールしない
 * - ヘッダー: 左端に「‹」（1 つ上の画面へ。イベント一覧には出さない）、Circle 名、右端にメニュー（≡）
 * - 「‹」は履歴を戻るのではなく親画面へ移動する（外部リンクから直接開いてもアプリ内に留まる）
 */
export function AppLayout() {
  const { data: me } = useMe();
  const { pathname } = useLocation();
  const up = upTarget(pathname);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex h-14 items-center gap-1">
          {up ? (
            <Link
              to={up.to}
              aria-label={up.label}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-accent"
            >
              <ChevronLeft className="size-6" />
            </Link>
          ) : (
            <span className="w-2 shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate font-semibold">{me?.circle.name}</span>
          <HeaderMenu isAdmin={me?.member.role === 'admin'} />
        </div>
      </header>
      <main className="flex-1 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
    </div>
  );
}
