/**
 * Event の作成・編集フォーム（担当: T2）。
 * 値の変換と検証は eventFormValues.ts。
 */
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LIMITS, type CreateEventRequest } from '@minton/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isApiError } from '@/lib/api';
import {
  EVENT_FORM_FIELDS,
  eventFormSchema,
  toEventRequest,
  type EventFormValues,
} from './eventFormValues';

const EMPTY: EventFormValues = { title: '', startAt: '', endAt: '', location: '' };

export function EventForm({
  defaultValues = EMPTY,
  submitLabel,
  onSubmit,
}: {
  defaultValues?: EventFormValues;
  submitLabel: string;
  /** 失敗時は throw する（ApiError の fieldErrors はフィールドに、その他はフォーム上部に表示） */
  onSubmit: (body: CreateEventRequest) => Promise<unknown>;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EventFormValues>({ resolver: zodResolver(eventFormSchema), defaultValues });

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(toEventRequest(values));
    } catch (e) {
      const fieldErrors = isApiError(e) ? e.details?.fieldErrors : undefined;
      let mapped = false;
      for (const field of EVENT_FORM_FIELDS) {
        const message = fieldErrors?.[field]?.[0];
        if (message) {
          setError(field, { message });
          mapped = true;
        }
      }
      if (!mapped) setError('root', { message: isApiError(e) ? e.message : 'エラーが発生しました' });
    }
  });

  const fieldError = (name: (typeof EVENT_FORM_FIELDS)[number]) =>
    errors[name]?.message ? (
      <p id={`${name}-error`} role="alert" className="text-sm text-destructive">
        {errors[name]?.message}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {errors.root?.message && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errors.root.message}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="startAt">開始日時</Label>
        <Input
          id="startAt"
          type="datetime-local"
          aria-invalid={!!errors.startAt}
          aria-describedby={errors.startAt ? 'startAt-error' : undefined}
          {...register('startAt')}
        />
        {fieldError('startAt')}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="endAt">終了日時</Label>
        <Input
          id="endAt"
          type="datetime-local"
          aria-invalid={!!errors.endAt}
          aria-describedby={errors.endAt ? 'endAt-error' : undefined}
          {...register('endAt')}
        />
        {fieldError('endAt')}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="location">場所</Label>
        <Input
          id="location"
          maxLength={LIMITS.locationMax}
          aria-invalid={!!errors.location}
          aria-describedby={errors.location ? 'location-error' : undefined}
          {...register('location')}
        />
        {fieldError('location')}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">
          タイトル<span className="text-xs font-normal text-muted-foreground">（任意）</span>
        </Label>
        <Input
          id="title"
          maxLength={LIMITS.titleMax}
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? 'title-error' : undefined}
          {...register('title')}
        />
        {fieldError('title')}
      </div>
      <p className="text-xs text-muted-foreground">日時は日本時間で入力してください。</p>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? '保存中…' : submitLabel}
      </Button>
    </form>
  );
}
