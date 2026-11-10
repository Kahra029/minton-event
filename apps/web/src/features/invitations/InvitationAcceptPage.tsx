/**
 * 招待からの初回登録（/invitations/:token）。成功時は useSetLoggedIn() を呼び、イベント一覧へ遷移する（C9）。
 * 担当: T4。Email は Invitation のものを表示のみ（入力させない: AC-16）。
 */
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  acceptInvitationRequestSchema,
  INVITATION_INVALID_MESSAGE,
  type AcceptInvitationRequest,
} from '@minton/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage, isApiError } from '@/lib/api';
import { useSetLoggedIn } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { useAcceptInvitation, useInvitationInfo } from './api';

const FIELDS = ['displayName', 'password', 'passwordConfirmation'] as const;

export function InvitationAcceptPage() {
  const { token = '' } = useParams();
  const info = useInvitationInfo(token);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">初回登録</h1>
      {info.isPending && <p className="text-sm text-muted-foreground">読み込み中…</p>}
      {info.isError && (
        <p role="alert" className="text-sm text-destructive">
          {isApiError(info.error, 'NOT_FOUND') ? INVITATION_INVALID_MESSAGE : errorMessage(info.error)}
        </p>
      )}
      {info.data && <AcceptForm token={token} circleName={info.data.circleName} email={info.data.email} />}
    </div>
  );
}

function AcceptForm({ token, circleName, email }: { token: string; circleName: string; email: string }) {
  const accept = useAcceptInvitation(token);
  const setLoggedIn = useSetLoggedIn();
  const navigate = useNavigate();
  const form = useForm<AcceptInvitationRequest>({
    resolver: zodResolver(acceptInvitationRequestSchema),
    defaultValues: { displayName: '', password: '', passwordConfirmation: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const me = await accept.mutateAsync(values);
      setLoggedIn(me);
      navigate(routes.events(), { replace: true });
    } catch (e) {
      const fieldErrors = isApiError(e, 'VALIDATION_ERROR') ? e.details?.fieldErrors : undefined;
      let mapped = false;
      for (const field of FIELDS) {
        const message = fieldErrors?.[field]?.[0];
        if (message) {
          form.setError(field, { message });
          mapped = true;
        }
      }
      if (!mapped) form.setError('root', { message: errorMessage(e) });
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{circleName}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium leading-none">メールアドレス</p>
            <p className="break-all text-sm" aria-label="招待先メールアドレス">
              {email}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">表示名</Label>
            <Input
              id="displayName"
              autoComplete="nickname"
              aria-invalid={!!errors.displayName}
              {...form.register('displayName')}
            />
            {errors.displayName && <p className="text-sm text-destructive">{errors.displayName.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">パスワード</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...form.register('password')}
            />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="passwordConfirmation">パスワード（確認）</Label>
            <Input
              id="passwordConfirmation"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.passwordConfirmation}
              {...form.register('passwordConfirmation')}
            />
            {errors.passwordConfirmation && (
              <p className="text-sm text-destructive">{errors.passwordConfirmation.message}</p>
            )}
          </div>
          {errors.root && (
            <p role="alert" className="text-sm text-destructive">
              {errors.root.message}
            </p>
          )}
          <Button type="submit" disabled={isSubmitting}>
            登録する
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
