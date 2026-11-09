import { matchPath } from 'react-router-dom';
import { routes } from '@/lib/routes';

/** ヘッダーの「‹」の行き先（1 つ上の画面）と、その画面名（アクセシブルな名前）。イベント一覧（最上位）は null（decisions C39） */
export function upTarget(pathname: string): { to: string; label: string } | null {
  if (matchPath('/events/new', pathname)) return { to: routes.events(), label: 'イベント一覧' };
  const edit = matchPath('/events/:eventId/edit', pathname);
  if (edit) return { to: routes.eventDetail(edit.params.eventId ?? ''), label: 'イベント詳細' };
  if (matchPath('/events/:eventId', pathname)) return { to: routes.events(), label: 'イベント一覧' };
  if (matchPath('/members', pathname)) return { to: routes.events(), label: 'イベント一覧' };
  if (matchPath('/events', pathname) || matchPath('/', pathname)) return null;
  // 存在しないパス（NotFound）からも一覧へ戻れるようにする
  return { to: routes.events(), label: 'イベント一覧' };
}
