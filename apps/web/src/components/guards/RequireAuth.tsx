import { Navigate, Outlet } from 'react-router-dom';
import { useMe } from '@/lib/auth';
import { loadLastCircleLoginId } from '@/lib/lastCircle';
import { routes } from '@/lib/routes';
import { FullPageMessage } from '@/components/layout/FullPageMessage';

/**
 * ログイン必須の画面を囲む。未ログインなら /login/<最後の circleLoginId> へ、
 * 保存値が無ければ案内画面（/login）へ（decisions C2）。
 * 認可は API 側でも必ず検証される。ここは UX のためのガード。
 */
export function RequireAuth() {
  const me = useMe();
  if (me.isPending) return <FullPageMessage>読み込み中…</FullPageMessage>;
  if (me.isError) return <FullPageMessage>エラーが発生しました。再読み込みしてください</FullPageMessage>;
  if (!me.data) {
    const last = loadLastCircleLoginId();
    return <Navigate to={last ? routes.login(last) : routes.loginGuide()} replace />;
  }
  return <Outlet />;
}
