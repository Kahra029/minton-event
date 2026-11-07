/** circleLoginId が分からない未ログイン状態の案内（decisions C2） */
export function LoginGuidePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-lg font-semibold">ログインURLを確認してください</h1>
      <p className="text-sm text-muted-foreground">
        サークルの管理者から案内されたログインURL（/login/…）を開いてください。
      </p>
    </div>
  );
}
