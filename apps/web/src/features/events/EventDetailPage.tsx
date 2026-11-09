/**
 * イベント詳細（/events/:eventId）。
 * 日時・場所・自分の出欠・参加/不参加/未回答人数・各 Member の出欠（AC-06 / AC-10）。
 * 出欠ボタンは features/attendance/AttendanceButtons（T3）を置く。編集への導線は admin のみ。
 * 別 Circle・存在しない Event は API が 404 を返し、「見つかりません」を表示する（AC-12）。
 */
import { Link, useParams } from 'react-router-dom';
import { CalendarDays, MapPin, Pencil } from 'lucide-react';
import type { EventDetail } from '@minton/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AttendanceButtons } from '@/features/attendance/AttendanceButtons';
import { errorMessage, isApiError } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { formatDateTimeRange } from '@/lib/datetime';
import { routes } from '@/lib/routes';
import { useEventDetail } from './api';
import { attendanceLabel, eventHeading } from './eventDisplay';

export function EventDetailPage() {
  const { eventId = '' } = useParams();
  const { data: me } = useMe();
  const detail = useEventDetail(eventId);

  return (
    <div className="flex flex-col gap-4">

      {detail.isPending && <p className="text-sm text-muted-foreground">読み込み中…</p>}
      {detail.isError &&
        (isApiError(detail.error, 'NOT_FOUND') ? (
          <p className="py-8 text-center text-sm text-muted-foreground">イベントが見つかりません</p>
        ) : (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(detail.error)}
          </p>
        ))}
      {detail.data && !detail.isError && me && (
        <EventDetailView
          event={detail.data.event}
          myMemberId={me.member.id}
          isAdmin={me.member.role === 'admin'}
        />
      )}
    </div>
  );
}

function EventDetailView({
  event,
  myMemberId,
  isAdmin,
}: {
  event: EventDetail;
  myMemberId: string;
  isAdmin: boolean;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h1 className="min-w-0 break-words text-lg font-semibold">{eventHeading(event)}</h1>
        {isAdmin && (
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link to={routes.eventEdit(event.id)}>
              <Pencil />
              編集
            </Link>
          </Button>
        )}
      </div>

      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex items-start gap-2">
          <dt>
            <CalendarDays className="mt-0.5 size-4" />
            <span className="sr-only">日時</span>
          </dt>
          <dd>{formatDateTimeRange(event.startAt, event.endAt)}</dd>
        </div>
        <div className="flex items-start gap-2">
          <dt>
            <MapPin className="mt-0.5 size-4" />
            <span className="sr-only">場所</span>
          </dt>
          <dd className="break-words">{event.location}</dd>
        </div>
      </dl>

      <section aria-labelledby="my-attendance" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <h2 id="my-attendance" className="text-sm font-medium">
          自分の出欠: <span data-testid="my-status">{attendanceLabel(event.myStatus)}</span>
        </h2>
        <AttendanceButtons eventId={event.id} memberId={myMemberId} currentStatus={event.myStatus} />
      </section>

      <section aria-labelledby="counts" className="flex flex-col gap-2">
        <h2 id="counts" className="sr-only">
          人数
        </h2>
        <ul className="grid grid-cols-3 gap-2 text-center">
          <CountItem label="参加" value={event.counts.attending} />
          <CountItem label="不参加" value={event.counts.absent} />
          <CountItem label="未回答" value={event.counts.unanswered} />
        </ul>
      </section>

      <section aria-labelledby="members" className="flex flex-col gap-2">
        <h2 id="members" className="text-sm font-medium">
          メンバーの出欠
        </h2>
        <ul className="divide-y rounded-xl border">
          {event.members.map((m) => (
            <li key={m.memberId} className="flex min-h-11 items-center justify-between gap-2 px-4 py-2 text-sm">
              <span className="min-w-0 break-words">
                {m.displayName}
                {m.memberId === myMemberId && <span className="text-muted-foreground">（自分）</span>}
              </span>
              <Badge
                variant={m.status === 'attending' ? 'default' : m.status === 'absent' ? 'secondary' : 'outline'}
              >
                {attendanceLabel(m.status)}
              </Badge>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function CountItem({ label, value }: { label: string; value: number }) {
  return (
    <li className="rounded-xl border p-2" aria-label={`${label} ${value}人`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">
        {value}
        <span className="text-xs font-normal">人</span>
      </div>
    </li>
  );
}
