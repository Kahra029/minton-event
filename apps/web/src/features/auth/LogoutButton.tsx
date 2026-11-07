/**
 * ログアウトボタン（AppLayout のヘッダーに配置済み）。
 * POST /api/auth/logout 成功後に useSetLoggedOut() で me を null にし、RequireAuth が /login/<最後の circleLoginId> へ送る。
 */
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLogout } from './api';

export function LogoutButton() {
  const logout = useLogout();
  return (
    <div className="flex shrink-0 items-center gap-2">
      {logout.isError && (
        <span role="alert" className="text-xs text-destructive">
          ログアウトに失敗しました
        </span>
      )}
      <Button variant="ghost" size="sm" className="h-11" onClick={() => logout.mutate()} disabled={logout.isPending}>
        <LogOut className="size-4" />
        ログアウト
      </Button>
    </div>
  );
}
