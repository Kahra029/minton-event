/**
 * イベント作成（/events/new、admin のみ。ルーターの RequireAdmin と API の requireAdmin で二重に制限）。
 * 成功時はイベント詳細へ遷移する（AC-03）。
 */
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { routes } from '@/lib/routes';
import { useCreateEvent } from './api';
import { EventForm } from './EventForm';

export function EventCreatePage() {
  const navigate = useNavigate();
  const create = useCreateEvent();

  return (
    <div className="flex flex-col gap-4">
      <Link
        to={routes.events()}
        className="inline-flex h-11 w-fit items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" />
        イベント一覧
      </Link>
      <h1 className="text-lg font-semibold">イベント作成</h1>
      <EventForm
        submitLabel="作成する"
        onSubmit={async (body) => {
          const { event } = await create.mutateAsync(body);
          navigate(routes.eventDetail(event.id), { replace: true });
        }}
      />
    </div>
  );
}
