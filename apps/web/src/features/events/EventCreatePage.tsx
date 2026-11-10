/**
 * イベント作成（/events/new、admin のみ。ルーターの RequireAdmin と API の requireAdmin で二重に制限）。
 * 成功時はイベント詳細へ遷移する（AC-03）。
 */
import { useNavigate } from 'react-router-dom';
import { routes } from '@/lib/routes';
import { useCreateEvent } from './api';
import { EventForm } from './EventForm';

export function EventCreatePage() {
  const navigate = useNavigate();
  const create = useCreateEvent();

  return (
    <div className="flex flex-col gap-4">
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
