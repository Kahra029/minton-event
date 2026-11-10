/**
 * 画面のルーティング。全画面をここで登録済み（Phase 1 では編集しない）。
 * 各画面の中身は src/features/<feature>/ のページコンポーネントに実装する。
 */
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { RequireAdmin } from '@/components/guards/RequireAdmin';
import { RequireAuth } from '@/components/guards/RequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { LoginPage } from '@/features/auth/LoginPage';
import { EventCreatePage } from '@/features/events/EventCreatePage';
import { EventDetailPage } from '@/features/events/EventDetailPage';
import { EventEditPage } from '@/features/events/EventEditPage';
import { EventListPage } from '@/features/events/EventListPage';
import { InvitationAcceptPage } from '@/features/invitations/InvitationAcceptPage';
import { MemberListPage } from '@/features/members/MemberListPage';
import { routes } from '@/lib/routes';
import { LoginGuidePage } from './pages/LoginGuidePage';
import { NotFoundPage } from './pages/NotFoundPage';

export const routeObjects: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [
      { path: '/login', element: <LoginGuidePage /> },
      { path: '/login/:circleLoginId', element: <LoginPage /> },
      { path: '/invitations/:token', element: <InvitationAcceptPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <Navigate to={routes.events()} replace /> },
          { path: '/events', element: <EventListPage /> },
          { path: '/events/:eventId', element: <EventDetailPage /> },
          {
            element: <RequireAdmin />,
            children: [
              { path: '/events/new', element: <EventCreatePage /> },
              { path: '/events/:eventId/edit', element: <EventEditPage /> },
              { path: '/members', element: <MemberListPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routeObjects);
