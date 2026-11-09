import type { AttendanceStatus } from '@minton/types';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useUpsertAttendance } from './api';

export type AttendanceButtonsProps = {
  eventId: string;
  /** ログイン中の自分の Member ID（PUT /api/events/:eventId/attendances/:memberId に使う） */
  memberId: string;
  /** 現在の自分の出欠。null = 未回答 */
  currentStatus: AttendanceStatus | null;
};

const LABELS: Record<AttendanceStatus, string> = { attending: '参加', absent: '不参加' };

/**
 * 参加 / 不参加ボタン。T2 がイベント詳細に置き、T3 が中身を実装する。
 * 押したら確認なしで即保存し（AC-21）、成功後に queryKeys.events.all を invalidate する。
 * 保存中は押した状態を先に表示し（楽観的更新）、失敗したら元の状態に戻してエラーを表示する。
 */
export function AttendanceButtons({ eventId, memberId, currentStatus }: AttendanceButtonsProps) {
  const mutation = useUpsertAttendance(eventId, memberId);
  // 保存中は押した値、保存成功後はサーバーが返した値、失敗時・未操作時は親から渡された値を表示する
  const shownStatus = mutation.isPending
    ? mutation.variables.status
    : mutation.isSuccess
      ? mutation.data.attendance.status
      : currentStatus;

  const select = (status: AttendanceStatus) => {
    if (mutation.isPending || status === shownStatus) return;
    mutation.mutate({ status });
  };

  return (
    <section aria-label="自分の出欠" className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        {(['attending', 'absent'] as const).map((status) => {
          const selected = shownStatus === status;
          return (
            <Button
              key={status}
              type="button"
              size="lg"
              variant={selected ? (status === 'attending' ? 'default' : 'secondary') : 'outline'}
              aria-pressed={selected}
              disabled={mutation.isPending}
              onClick={() => select(status)}
              className={cn('h-14 w-full text-base font-semibold', selected && status === 'absent' && 'ring-2 ring-foreground/30')}
            >
              {LABELS[status]}
            </Button>
          );
        })}
      </div>
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          出欠を保存できませんでした: {errorMessage(mutation.error)}
        </p>
      )}
    </section>
  );
}
