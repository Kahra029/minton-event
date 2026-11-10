/**
 * イベント一覧（/events）。今後の Event を開始日時の昇順（B7 / C4。並びは API が返す順）。
 * 各 Event に開催日時・場所・自分の出欠状態・参加人数（AC-05）。admin には作成への導線を出す（AC-04: member には出さない）。
 */
import { Link } from 'react-router-dom';
import { ChevronRight, MapPin, Plus } from 'lucide-react';
import type { EventListItem } from '@minton/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { formatDateTimeRange } from '@/lib/datetime';
import { routes } from '@/lib/routes';
import { useEventList } from './api';
import { attendanceLabel, eventHeading } from './eventDisplay';

export function EventListPage() {
  const { data: me } = useMe();
  const isAdmin = me?.member.role === 'admin';
  const list = useEventList();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">イベント一覧</h1>
        {isAdmin && (
          <Button asChild size="sm">
            <Link to={routes.eventNew()}>
              <Plus />
              イベント作成
            </Link>
          </Button>
        )}
      </div>

      {list.isPending && <p className="text-sm text-muted-foreground">読み込み中…</p>}
      {list.isError && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(list.error)}
        </p>
      )}
      {list.data && list.data.events.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">予定されているイベントはありません</p>
      )}
      {list.data && list.data.events.length > 0 && (
        <ul className="flex flex-col gap-3">
          {list.data.events.map((event) => (
            <li key={event.id}>
              <EventListCard event={event} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventListCard({ event }: { event: EventListItem }) {
  const answered = event.myStatus !== null;
  return (
    <Link
      to={routes.eventDetail(event.id)}
      className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-accent"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="break-words font-semibold">{eventHeading(event)}</h2>
        {event.title !== null && (
          <p className="text-sm">{formatDateTimeRange(event.startAt, event.endAt)}</p>
        )}
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0" />
          <span className="break-words">{event.location}</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={event.myStatus === 'attending' ? 'default' : answered ? 'secondary' : 'outline'}>
            自分: {attendanceLabel(event.myStatus)}
          </Badge>
          <span>参加 {event.attendingCount}人</span>
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
