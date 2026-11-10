/** 画面のパス。リンク・navigate はこれを使う（router.tsx の定義と一致させる） */
const e = encodeURIComponent;

export const routes = {
  loginGuide: () => '/login',
  login: (circleLoginId: string) => `/login/${e(circleLoginId)}`,
  events: () => '/events',
  eventNew: () => '/events/new',
  eventDetail: (eventId: string) => `/events/${e(eventId)}`,
  eventEdit: (eventId: string) => `/events/${e(eventId)}/edit`,
  members: () => '/members',
  invitation: (token: string) => `/invitations/${e(token)}`,
};
