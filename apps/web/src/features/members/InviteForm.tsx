import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createInvitationRequestSchema, type CreateInvitationRequest } from '@minton/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage, isApiError } from '@/lib/api';
import { useCreateInvitation } from './api';

/** メンバー招待フォーム（AC-13）。メンバー一覧の上部に置く */
export function InviteForm() {
  const createInvitation = useCreateInvitation();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<CreateInvitationRequest>({
    resolver: zodResolver(createInvitationRequestSchema),
    defaultValues: { email: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setSentTo(null);
    try {
      const res = await createInvitation.mutateAsync(values);
      setSentTo(res.invitation.email);
      form.reset();
    } catch (e) {
      const fieldError = isApiError(e) ? e.details?.fieldErrors?.email?.[0] : undefined;
      form.setError('root', { message: fieldError ?? errorMessage(e) });
    }
  });

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
      {sentTo && (
        <p role="status" className="text-sm text-muted-foreground">
          {sentTo} に招待メールを送信しました
        </p>
      )}
    </form>
  );
}
