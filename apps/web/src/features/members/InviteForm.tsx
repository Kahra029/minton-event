import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createInvitationRequestSchema, type CreateInvitationRequest } from '@minton/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage, isApiError } from '@/lib/api';
import { useCreateInvitation } from './api';

type CreatedInvitation = { email: string; url: string };

/**
 * メンバー招待フォーム（AC-13）。メンバー一覧の上部に置く。
 * メールは送らない（C31）。作成直後のレスポンスの招待 URL をここにだけ表示し、admin がコピーして本人に渡す。
 * Token はハッシュだけ保存されるため再表示はできない（state にだけ持ち、保存しない）。
 */
export function InviteForm() {
  const createInvitation = useCreateInvitation();
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [copied, setCopied] = useState(false);
  const form = useForm<CreateInvitationRequest>({
    resolver: zodResolver(createInvitationRequestSchema),
    defaultValues: { email: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setCreated(null);
    setCopied(false);
    try {
      const res = await createInvitation.mutateAsync(values);
      setCreated({ email: res.invitation.email, url: res.invitationUrl });
      form.reset();
    } catch (e) {
      const fieldError = isApiError(e) ? e.details?.fieldErrors?.email?.[0] : undefined;
      form.setError('root', { message: fieldError ?? errorMessage(e) });
    }
  });

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
    } catch {
      // コピーできない環境では、表示中の URL を選択してコピーしてもらう
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2" aria-label="メンバー招待">
      <Label htmlFor="invite-email">招待するメールアドレス</Label>
      <div className="flex gap-2">
        <Input
          id="invite-email"
          type="email"
          inputMode="email"
          autoComplete="off"
          aria-invalid={!!errors.email}
          {...form.register('email')}
        />
        <Button type="submit" disabled={isSubmitting} className="shrink-0">
          招待する
        </Button>
      </div>
      {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      {errors.root && (
        <p role="alert" className="text-sm text-destructive">
          {errors.root.message}
        </p>
      )}
      {created && (
        <div className="flex flex-col gap-2 rounded-xl border p-3">
          <p role="status" className="text-sm">
            {created.email} の招待URLを作成しました
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={created.url}
              aria-label="招待URL"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button type="button" variant="outline" className="shrink-0" onClick={copy}>
              {copied ? 'コピーしました' : 'コピー'}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">この URL は再表示できません。コピーして本人に渡してください</p>
        </div>
      )}
    </form>
  );
}
