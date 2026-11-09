/**
 * ログアウトボタン（AppLayout のヘッダーメニューに配置: decisions C39）。
 * POST /api/auth/logout 成功後に useSetLoggedOut() で me を null にし、RequireAuth が /login/<最後の circleLoginId> へ送る。
 */
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLogout } from './api';

export function LogoutButton() {
  const logout = useLogout();
  return (
    <div className="flex flex-col">
      <Button
        variant="ghost"
        className="w-full justify-start px-3 font-normal"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
      >
        <LogOut className="size-4" />
        ログアウト
      </Button>
      {logout.isError && (
        <span role="alert" className="px-3 pb-2 text-xs text-destructive">
          ログアウトに失敗しました
        </span>
      )}
    </div>
  );
}
