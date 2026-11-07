import type { AttendanceStatus } from '@minton/types';

export type AttendanceButtonsProps = {
  eventId: string;
  /** ログイン中の自分の Member ID（PUT /api/events/:eventId/attendances/:memberId に使う） */
  memberId: string;
  /** 現在の自分の出欠。null = 未回答 */
  currentStatus: AttendanceStatus | null;
};

/**
 * 参加 / 不参加ボタン。T2 がイベント詳細に置き、T3 が中身を実装する。
 * 押したら確認なしで即保存し（AC-21）、成功後に queryKeys.events.all を invalidate する。
 */
export function AttendanceButtons(props: AttendanceButtonsProps) {
  void props;
  return null;
}
