import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LogoutButton } from '@/features/auth/LogoutButton';
import { routes } from '@/lib/routes';

/**
 * ヘッダー右端のメニュー（≡）。中身は「メンバー一覧」（admin のみ）と「ログアウト」（decisions C39）。
 * 外側のタップ・Escape・画面遷移で閉じる。
 */
export function HeaderMenu({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  // 画面遷移したら閉じる
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <Button
        variant="ghost"
        size="icon"
        aria-label="メニュー"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <Menu className="size-5" />
      </Button>
      {open && (
        <div
          id={panelId}
          className="absolute right-0 top-full z-20 mt-1 flex w-48 flex-col gap-1 rounded-lg border bg-popover p-1 shadow-md"
        >
          {isAdmin && (
            <Link
              to={routes.members()}
              className="inline-flex h-11 items-center gap-2 rounded-md px-3 text-sm hover:bg-accent"
            >
              <Users className="size-4" />
              メンバー一覧
            </Link>
          )}
          <LogoutButton />
        </div>
      )}
    </div>
  );
}
