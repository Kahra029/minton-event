import { Link } from 'react-router-dom';
import { routes } from '@/lib/routes';

export function NotFoundPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <p className="text-sm text-muted-foreground">ページが見つかりません</p>
      <Link to={routes.events()} className="text-sm text-primary underline">
        イベント一覧へ
      </Link>
    </div>
  );
}
