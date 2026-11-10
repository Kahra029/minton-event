/**
 * TanStack Query の queryKey。機能をまたいで invalidate するのでここに集約する。
 * 例: 出欠変更（T3）後に events.all を invalidate すると一覧・詳細の人数が更新される。
 */
export const queryKeys = {
  me: ['me'] as const,
  events: {
    all: ['events'] as const,
    list: () => ['events', 'list'] as const,
    detail: (eventId: string) => ['events', 'detail', eventId] as const,
  },
  members: {
    all: ['members'] as const,
    list: () => ['members', 'list'] as const,
  },
  invitations: {
    info: (token: string) => ['invitations', 'info', token] as const,
  },
};
