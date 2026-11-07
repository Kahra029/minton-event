/**
 * API のパス。api のルーティング（apps/api/src/index.ts）と web の API クライアントの両方がこれに従う。
 * Token・ID は encodeURIComponent してから埋め込む。
 */
const e = encodeURIComponent;

export const apiPaths = {
  auth: {
    login: '/api/auth/login', // POST
    logout: '/api/auth/logout', // POST
    me: '/api/auth/me', // GET
  },
  events: {
    list: '/api/events', // GET
    create: '/api/events', // POST (admin)
    detail: (eventId: string) => `/api/events/${e(eventId)}`, // GET / PUT (admin) / DELETE (admin)
  },
  attendance: {
    upsert: (eventId: string, memberId: string) =>
      `/api/events/${e(eventId)}/attendances/${e(memberId)}`, // PUT
  },
  invitations: {
    create: '/api/invitations', // POST (admin)
    info: (token: string) => `/api/invitations/${e(token)}`, // GET
    accept: (token: string) => `/api/invitations/${e(token)}/accept`, // POST
  },
  members: {
    list: '/api/members', // GET (admin)
  },
} as const;
