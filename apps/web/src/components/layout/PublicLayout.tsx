import { Outlet } from 'react-router-dom';

/** ログイン前の画面（ログイン・招待からの登録）の共通レイアウト */
export function PublicLayout() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-8">
      <Outlet />
    </div>
  );
}
