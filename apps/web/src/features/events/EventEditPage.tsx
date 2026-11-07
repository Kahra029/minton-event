/**
 * イベント編集（/events/:eventId/edit、admin のみ）。保存（AC-18）・削除（AC-19、確認ダイアログ付き）。
 * 保存後はイベント詳細へ、削除後はイベント一覧へ遷移する。
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { errorMessage, isApiError } from '@/lib/api';
import { routes } from '@/lib/routes';
import { useDeleteEvent, useEventDetail, useUpdateEvent } from './api';
import { eventHeading } from './eventDisplay';
import { EventForm } from './EventForm';
import { eventToFormValues } from './eventFormValues';

export function EventEditPage() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();
  const detail = useEventDetail(eventId);
  const update = useUpdateEvent(eventId);

  return (
    <div className="flex flex-col gap-4">
      <Link
        to={routes.eventDetail(eventId)}
        className="inline-flex h-11 w-fit items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" />
        イベント詳細
      </Link>
      <h1 className="text-lg font-semibold">イベント編集</h1>

      {detail.isPending && <p className="text-sm text-muted-foreground">読み込み中…</p>}
      {detail.isError &&
        (isApiError(detail.error, 'NOT_FOUND') ? (
          <p className="py-8 text-center text-sm text-muted-foreground">イベントが見つかりません</p>
        ) : (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(detail.error)}
          </p>
        ))}
      {detail.data && !detail.isError && (
        <>
          <EventForm
            // 再取得で別の値になったらフォームを作り直す
            key={detail.data.event.updatedAt}
            defaultValues={eventToFormValues(detail.data.event)}
            submitLabel="保存する"
            onSubmit={async (body) => {
              await update.mutateAsync(body);
              navigate(routes.eventDetail(eventId), { replace: true });
            }}
          />
          <DeleteEventButton eventId={eventId} heading={eventHeading(detail.data.event)} />
        </>
      )}
    </div>
  );
}

function DeleteEventButton({ eventId, heading }: { eventId: string; heading: string }) {
  const navigate = useNavigate();
  const remove = useDeleteEvent(eventId);
  const [open, setOpen] = useState(false);

  const onConfirm = () =>
    remove.mutate(undefined, {
      onSuccess: () => {
        setOpen(false);
        navigate(routes.events(), { replace: true });
      },
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (remove.isPending) return;
        if (!next) remove.reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="mt-4 w-full text-destructive">
          <Trash2 />
          このイベントを削除
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>イベントを削除しますか？</DialogTitle>
          <DialogDescription>
            「{heading}」を削除します。メンバーの出欠も削除され、元に戻せません。
          </DialogDescription>
        </DialogHeader>
        {remove.isError && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(remove.error)}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={remove.isPending}>
              キャンセル
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={onConfirm} disabled={remove.isPending}>
            {remove.isPending ? '削除中…' : '削除する'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
