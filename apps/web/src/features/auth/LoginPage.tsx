/**
 * ログイン画面（/login/:circleLoginId）。Email / Password で認証し、成功時はイベント一覧へ遷移する（AC-01）。
 * Validation は UX 用（API でも必ず検証される）。
 */
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from 'react-router-dom';
import { loginRequestSchema } from '@minton/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/api';
import { routes } from '@/lib/routes';
import { useLogin } from './api';

const formSchema = loginRequestSchema.pick({ email: true, password: true });
type FormInput = { email: string; password: string };

export function LoginPage() {
  const { circleLoginId = '' } = useParams();
  const navigate = useNavigate();
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInput>({ resolver: zodResolver(formSchema), defaultValues: { email: '', password: '' } });

  const onSubmit = handleSubmit((values) => {
    login.mutate(
      { circleLoginId, email: values.email, password: values.password },
      { onSuccess: () => navigate(routes.events(), { replace: true }) },
    );
  });

  return (
    <div className="flex flex-col gap-6 pt-8">
      <h1 className="text-xl font-semibold">ログイン</h1>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">メールアドレス</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            aria-invalid={!!errors.email}
            {...register('email')}
          />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">パスワード</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
          {errors.password && <p className="text-sm text-destructive">パスワードを入力してください</p>}
        </div>
        {login.isError && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(login.error)}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? 'ログイン中…' : 'ログイン'}
        </Button>
      </form>
    </div>
  );
}
