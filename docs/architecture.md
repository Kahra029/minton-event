# アーキテクチャ・実装規約

仕様は `.orca/drops/badminton_*.md`（ドメインモデル / 受け入れ条件 / ガードレール）と `docs/decisions.md` に従う。
このドキュメントは「どこに何を書くか」「どう書くか」の規約。

## 1. ディレクトリ構成

```text
.
├── apps/
│   ├── api/                      Hono + Cloudflare Workers + D1 + Drizzle
│   │   ├── migrations/           D1 Migration（手書き SQL。src/db/schema.ts と一致させる）
│   │   ├── src/
│   │   │   ├── index.ts          エントリ。middleware・エラーハンドラ・全 route のマウント（共有）
│   │   │   ├── bindings.ts       AppEnv（Bindings / c.var の型）（共有）
│   │   │   ├── db/
│   │   │   │   ├── schema.ts     Drizzle スキーマ（共有）
│   │   │   │   ├── client.ts     getDb()（共有）
│   │   │   │   └── <feature>.ts  機能ごとのクエリ関数（各担当）
│   │   │   ├── lib/              共通部品（共有）: errors / logger / session / password / crypto / id / time
│   │   │   ├── middleware/       requireAuth / requireAdmin / requestLogger（共有）
│   │   │   └── routes/<feature>.ts  機能ごとの Hono app（各担当）
│   │   ├── scripts/              seed CLI（T1: decisions A5 / C10）
│   │   └── test/
│   │       ├── helpers.ts        テスト用ヘルパー（共有）
│   │       ├── foundation/       基盤のテスト（T0）
│   │       └── <feature>/        機能ごとの integration テスト（各担当）
│   └── web/                      Vite + React + TS + Tailwind + shadcn/ui
│       └── src/
│           ├── main.tsx          エントリ（共有）
│           ├── app/              router.tsx（全画面登録済み）/ queryClient.ts / 共通ページ（共有）
│           ├── components/ui/    shadcn/ui 部品（共有）
│           ├── components/layout/, components/guards/   レイアウト・認証ガード（共有）
│           ├── lib/              api クライアント / auth / queryKeys / routes / datetime / lastCircle（共有）
│           ├── test/             テスト setup と renderRoute ヘルパー（共有）
│           └── features/<feature>/   機能ごとの画面・hooks・部品（各担当）
├── packages/types/               zod スキーマと API の request/response 型（共有。api と web が import）
├── e2e/                          Playwright（スマホ viewport を含む）
└── docs/
```

## 2. Phase 1 の担当範囲（作成・編集してよいファイル）

**共有ファイル（下記以外すべて。特に packages/types、db/schema.ts と migrations、api/src/index.ts、api/src/lib/*、
api/src/middleware/*、api/test/helpers.ts、web の app/・components/・lib/・test/）は編集しない。**
変更が必要なら `orca orchestration ask` で相談する。

| 担当 | api | web | E2E |
|---|---|---|---|
| T1 認証 | `src/routes/auth.ts`、`src/db/auth.ts`、`scripts/seed*`（A5）、`test/auth/**` | `src/features/auth/**`（LoginPage, LogoutButton） | `e2e/auth*.spec.ts` |
| T2 Event | `src/routes/events.ts`、`src/db/events.ts`、`test/events/**` | `src/features/events/**` | `e2e/events*.spec.ts` |
| T3 出欠 | `src/routes/attendance.ts`、`src/db/attendance.ts`、`test/attendance/**` | `src/features/attendance/**`（AttendanceButtons） | `e2e/attendance*.spec.ts` |
| T4 招待・メンバー | `src/routes/invitations.ts`、`src/routes/members.ts`、`src/db/invitations.ts`、`src/db/members.ts`、`src/mail/**`（Resend 送信: A4 / C7）、`test/invitations/**`、`test/members/**` | `src/features/invitations/**`、`src/features/members/**` | `e2e/invitations*.spec.ts`、`e2e/members*.spec.ts` |

補足:
- `routes/events.ts`（T2）と `routes/attendance.ts`（T3）はどちらも `/api/events` にマウントされている。
  T2 は `/:eventId/attendances/*` を登録しない。T3 は `/:eventId/attendances/:memberId` 以外を登録しない。
- 他機能のクエリが必要な場合（例: T2 の詳細で出欠を集計する）は、自分の `db/<feature>.ts` に書いてよい
  （schema.ts の import は自由）。他担当の `db/*.ts` は編集しない。
- web の機能間連携:
  - T2 のイベント詳細は `features/attendance/AttendanceButtons`（T3）を import して置く。props は `AttendanceButtonsProps`（eventId, memberId, currentStatus）
  - T3 は出欠保存の成功後に `queryKeys.events.all` を invalidate する（一覧・詳細の人数が更新される）
  - T1 / T4 はログイン成功・初回登録成功時に `useSetLoggedIn()(me)` を呼んで `routes.events()` へ遷移する。ログアウト成功時は `useSetLoggedOut()`
- API の request/response 型は `packages/types` に**定義済み**。各担当は実装をこれに合わせる。

## 3. API の規約

### 契約
- パス: `packages/types/src/paths.ts` の `apiPaths`。スキーマ・型・ステータスは `packages/types/src/<feature>.ts` のコメントを参照
- 入力は必ず zod で検証する: `parseJsonBody(c, schema)` / `parseParams(c, schema)` / `parseOrThrow(schema, data)`（`lib/errors.ts`）。
  失敗は自動で 400 VALIDATION_ERROR（`details` に `fieldErrors`）になる
- 日時は UTC ISO 文字列で保存・返却（`lib/time.ts` の `toUtcIso()` / `nowUtcIso()` を使い、`Date#toISOString()` 形式に揃える）
- Email は `emailSchema`（trim + 小文字化）を通した値で保存・照合する（C5）
- ID は `newId()`（ULID）

### Circle 境界（最重要: guardrails §2）
- 認証が必要な route は `requireAuth` / `requireAdmin` を付け、`c.var.member`（`{ id, circleId, role }`）を使う
- **DB アクセス関数は必ず `circleId` を引数に取り、WHERE に `circle_id = ?` を入れる。ID だけで取得・更新・削除しない**

  ```ts
  // db/events.ts
  export async function findEvent(db: DB, circleId: string, eventId: string) {
    return db.query.events.findFirst({
      where: and(eq(events.circleId, circleId), eq(events.id, eventId)),
    });
  }
  ```
- `circleId` は常に `c.var.member.circleId` から渡す。リクエストのボディやパスから受け取った Circle ID を信用しない
- 別 Circle のリソースは「存在しない」と同じく 404（B14）。403 にしない（存在を開示しない）
- DB でも複合 FK `(circle_id, id)` により、別 Circle の Event / Member を組み合わせた Attendance・Session などは保存できない
- 認可は API で必ず検証する（web で非表示にするだけにしない）。admin 専用は `requireAdmin`（未ログイン 401、member 403）

### エラー
- `lib/errors.ts` のヘルパーを throw する: `validationError()` 400 / `unauthorized()` 401 / `forbidden()` 403 / `notFound()` 404 / `conflict()` 409。
  それ以外の例外は 500 INTERNAL_ERROR になり、メッセージ・stack trace は返さない
- レスポンス形式は `ApiErrorResponse`: `{ "error": { "code": "NOT_FOUND", "message": "...", "details"?: {...} } }`
- `message` は Client に表示されるので日本語のユーザー向け文言にし、内部情報や秘密情報を入れない
- 同時リクエストの UNIQUE 制約違反は `isUniqueConstraintError(e)` で判定して `conflict()` に変換してよい

### ログ（guardrails §13）
- `requestLogger` が全リクエストを JSON 1 行で記録する: requestId / method / route（パターン）/ params（`token` 以外）/ status / durationMs /
  circleId / memberId / errorCode / timestamp。実パス・クエリ・ボディ・Cookie は記録しない
- 操作対象を追加するときは `setLogContext(c, { eventId, invitationId })`。追加のログは `log('info', 'event_name', {...})`
- Password / Session Token / Invitation Token / Password Hash / API キーをログに渡さない（キー名で自動 `[REDACTED]` されるが、それに頼らない）。
  例外: C7（RESEND_API_KEY 未設定の開発環境に限り招待 URL をログ出力してよい。T4）

### 認証・Session（A2 / A3 / C1）
- `lib/password.ts`: `hashPassword(pw)` / `verifyPassword(pw, storedHashOrNull)`（PBKDF2-SHA256、100,000 回、Salt 16 bytes、定数時間比較）。
  Member が見つからないときも `verifyPassword(pw, null)` を呼んで時間差を作らない
- `lib/session.ts`: `createSession(c, db, { circleId, memberId })`（Token 発行・ハッシュ保存・Cookie 設定）、`destroySession(c, db)`、`getSessionMember(c, db)`。
  Cookie は `session`、HttpOnly / SameSite=Lax / Path=/ / Secure（https 時）、有効期限 30 日固定（延長なし）
- Token（Session / Invitation）は `lib/crypto.ts` の `generateToken()`（256 bit）で作り、DB には `hashToken()`（SHA-256）だけを保存する

## 4. web の規約
- 画面は `src/app/router.tsx` に全部登録済み。各担当は `features/<feature>/` のページの中身を実装する
- API 呼び出しは `lib/api.ts` の `api.get/post/put/delete` と `@minton/types` の `apiPaths` を使い、`features/<feature>/api.ts`（hooks）にまとめる。
  失敗は `ApiError`（`code` / `message` / `details.fieldErrors`）。表示は `errorMessage(e)`
- どの API でも 401 が返ると自動でログアウト状態になり、`RequireAuth` が `/login/<最後の circleLoginId>` へ送る（C2）
- queryKey は `lib/queryKeys.ts`、画面パスは `lib/routes.ts` を使う
- 日時の表示・入力は `lib/datetime.ts`（API は UTC、表示・入力は JST: B8）
- フォームは react-hook-form + `@hookform/resolvers/zod` で `packages/types` のスキーマを使う（Frontend の Validation は UX 用。API でも必ず検証される）
- モバイルファースト（guardrails §12）: レイアウトは `max-w-md`、ボタンは高さ 44px 以上（`Button` の既定）、主要操作を上部に、横スクロールなし
- shadcn/ui の部品は `components/ui/` にある（button, card, input, label, badge, dialog）。削除確認は `Dialog` を使う

## 5. テスト
- すべてルートで `npm run typecheck && npm run lint && npm test` が通ること
- **api**（vitest + @cloudflare/vitest-pool-workers）: Migration 適用済みの D1 で integration テストを書く。`apps/api/test/<feature>/*.test.ts`

  ```ts
  import { createEvent, errorCode, request, setupCircle } from '../helpers';

  it('別 Circle の Event は 404', async () => {
    const a = await setupCircle();
    const b = await setupCircle();
    const event = await createEvent({ circleId: b.circle.id, createdBy: b.admin.id });
    const res = await request(`/api/events/${event.id}`, { cookie: a.memberCookie });
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('NOT_FOUND');
  });
  ```
  - `setupCircle()`: Circle + admin + member と、それぞれのログイン済み Cookie（`adminCookie` / `memberCookie`）
  - `createCircle / createMember / createEvent / createAttendance / createInvitation（平文 token も返す）/ sessionCookie(member)`
  - `request(path, { method, body, cookie })` で `app` を直接呼ぶ。`sessionFromSetCookie(res)` で Set-Cookie の Session を取り出せる
  - 生成される ID・Email・circleLoginId は一意なので、テスト間でデータを掃除しなくてよい（件数を数えるテストは自分の Circle で絞る）
  - 必ず書く観点: 正常系、Validation、未ログイン 401、権限 403、別 Circle 404（AC-12）
- **web**（vitest + jsdom + Testing Library）: `apps/web/src/**/*.test.tsx`。`src/test/render.tsx` の `renderRoute(path, { me })` で実際のルーターで描画し、
  fetch は `vi.stubGlobal('fetch', ...)` で差し替える
- **E2E**（Playwright）: `e2e/*.spec.ts`。`npm run test:e2e`（`npm test` には含めない）。スマホ（iPhone 13 / Pixel 7）とデスクトップの project がある。
  - `npm run test:e2e`（= `node e2e/run-local.mjs`）は、5173 / 8787 が空いていることを確認してからこの worktree の `npm run dev` を起動し、
    ローカル D1 に Migration を適用して Playwright を 1 worker で実行する（ポート使用中・`RESEND_API_KEY` 設定時は中止）。
    Playwright の引数はそのまま渡せる: `npm run test:e2e -- --project=mobile-safari`
  - 事前に `apps/api/.dev.vars`（`APP_BASE_URL` を含む）を用意する。招待 URL は dev ログから取る（decisions C7）
  - テストデータは `e2e/support/helpers.ts`（seed CLI と API）でローカル D1 に毎回一意に作る
  初回は `npx playwright install chromium webkit`

## 6. ローカル起動

```sh
npm install
cp apps/api/.dev.vars.example apps/api/.dev.vars   # 必要な Secret があれば記入
npm run db:migrate:local                            # ローカル D1 に Migration を適用（apps/api/.wrangler/ に保存）
npm run dev                                         # api: http://127.0.0.1:8787 / web: http://localhost:5173
curl http://localhost:5173/api/health               # → {"ok":true}（Vite proxy 経由で api に届く）
```

- web の dev サーバーは `/api` を wrangler dev に proxy する（同一オリジンなので Session Cookie がそのまま使える）
- Circle / admin の初期データは seed CLI（T1 が `apps/api/scripts/` に作成）で投入する
- `wrangler.jsonc` の `database_id` はプレースホルダ。remote の D1 作成・デプロイ・Secret 登録は別途行う

## 7. DB / Migration
- テーブル: circles / members / sessions / events / attendances / invitations（`apps/api/src/db/schema.ts`）
- 構造変更は `apps/api/migrations/NNNN_<name>.sql` を追加し、`schema.ts` も合わせて更新する（`test/foundation/schema-sync.test.ts` がカラムの一致を検査する）。
  Phase 1 で必要になった場合は ask で相談する
- 日時は UTC ISO 文字列。`attendances.status` は `attending` / `absent` のみ（未回答はレコードなし）。
  `invitations.status` は `pending` / `accepted` / `revoked`（expired は `expires_at <= 現在` で判定: B3）
