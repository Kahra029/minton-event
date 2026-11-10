import { Link, Outlet } from 'react-router-dom';
import { useMe } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { FullPageMessage } from '@/components/layout/FullPageMessage';

/**
 * admin のみの画面を囲む（RequireAuth の内側で使う）。admin 以外には権限が無い旨を表示する。
 * API 側でも requireAdmin で 403 になる。
 */
export function RequireAdmin() {
  const me = useMe();
  if (me.data?.member.role !== 'admin') {
    return (
      <FullPageMessage>
        <p>この画面を表示する権限がありません</p>
        <Link to={routes.events()} className="mt-4 inline-block text-primary underline">
          イベント一覧へ
        </Link>
      </FullPageMessage>
    );
  }
  return <Outlet />;
}
