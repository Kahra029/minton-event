# アーキテクチャ・実装規約

仕様は `.orca/drops/badminton_*.md`（ドメインモデル / 受け入れ条件 / ガードレール）と `docs/decisions.md` に従う。
このドキュメントは「どこに何を書くか」「どう書くか」の規約。

## 1. ディレクトリ構成

```text
.
├── apps/
│   ├── api/                      Hono + Cloudflare Workers + D1 + Drizzle（3 層構成: §3。decisions C21 / C22）
│   │   ├── migrations/           D1 Migration（手書き SQL。src/datasource/db/schema.ts と一致させる）
│   │   ├── src/
│   │   │   ├── index.ts          エントリ（wrangler の main）。createApp に composition root と ID 生成を渡す
│   │   │   ├── composition.ts    composition root。env から datasource を組み立てて usecase に渡す（共有）
│   │   │   ├── application/      Hono に依存してよい唯一の層
│   │   │   │   ├── app.ts        middleware・エラーハンドラ・全 route のマウント（共有）
│   │   │   │   ├── env.ts        AppEnv（Bindings / c.var の型）（共有）
│   │   │   │   ├── errors.ts     errorHandler / notFoundHandler / parseJsonBody / parseParams（共有）
│   │   │   │   ├── logger.ts     log / redact / setLogContext / usecase に渡す RequestLogger（共有）
│   │   │   │   ├── sessionCookie.ts  Session Cookie の読み書き（共有）
│   │   │   │   ├── middleware/   requestLogger / provideUsecases / requireAuth / requireAdmin（共有）
│   │   │   │   └── routes/<feature>.ts  機能ごとの Hono app（検証 → usecase → レスポンス）
│   │   │   ├── usecase/          業務ルールと port。Hono / Drizzle / D1 / Resend / WebCrypto / Workers に依存しない
│   │   │   │   ├── index.ts      Usecases（c.var.usecases の型）
│   │   │   │   ├── errors.ts     AppError と validationError / unauthorized / forbidden / notFound / conflict / internalError
│   │   │   │   ├── ports.ts      機能間で共有する port（Now / NewId / TokenService / PasswordHasher / RequestLogger）と AuthMember
│   │   │   │   ├── authorization.ts  assertAdmin
│   │   │   │   ├── session.ts    Session の発行（issueSession）・SessionRepository・有効期限（C1）
│   │   │   │   ├── time.ts       toUtcIso / addMs / DAY_MS（純粋な関数）
│   │   │   │   └── <feature>.ts  機能ごとの usecase（create<Feature>Usecase）とその Repository の port
│   │   │   └── datasource/       port の実装
│   │   │       ├── db/schema.ts, db/client.ts  Drizzle スキーマと getDb（共有）
│   │   │       ├── d1/<feature>.ts   Repository の実装（Drizzle + D1）。sessions.ts は Session
│   │   │       ├── mail.ts       招待メール（Resend / dev ログ: A4 / C7 / C23）
│   │   │       ├── password.ts   PBKDF2（A3）、crypto.ts  Token の生成とハッシュ、id.ts  ULID、clock.ts  現在時刻
│   │   ├── scripts/              seed CLI（decisions A5 / C10）
│   │   └── test/
│   │       ├── helpers.ts        テスト用ヘルパー（共有）
│   │       ├── foundation/       基盤のテスト（testApp.ts は基盤テスト用の小さな app）
│   │       ├── usecase/          usecase の unit テスト（fake の port。fakes.ts）
│   │       └── <feature>/        機能ごとの integration テスト
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

**共有ファイル（下記以外すべて。特に packages/types、datasource/db/schema.ts と migrations、api/src/index.ts・composition.ts、
api/src/application/ の routes 以外、api/src/usecase/ の errors・ports・authorization・session・time・index、api/test/helpers.ts、
web の app/・components/・lib/・test/）は編集しない。**
変更が必要なら `orca orchestration ask` で相談する。

| 担当 | api | web | E2E |
|---|---|---|---|
| T1 認証 | `src/{application/routes,usecase,datasource/d1}/auth.ts`、`scripts/seed*`（A5）、`test/auth/**` | `src/features/auth/**`（LoginPage, LogoutButton） | `e2e/auth*.spec.ts` |
| T2 Event | `src/{application/routes,usecase,datasource/d1}/events.ts`、`test/events/**` | `src/features/events/**` | `e2e/events*.spec.ts` |
| T3 出欠 | `src/{application/routes,usecase,datasource/d1}/attendance.ts`、`test/attendance/**` | `src/features/attendance/**`（AttendanceButtons） | `e2e/attendance*.spec.ts` |
| T4 招待・メンバー | `src/{application/routes,usecase,datasource/d1}/{invitations,members}.ts`、`src/datasource/mail.ts`（Resend 送信: A4 / C7 / C23）、`test/invitations/**`、`test/members/**` | `src/features/invitations/**`、`src/features/members/**` | `e2e/invitations*.spec.ts`、`e2e/members*.spec.ts` |

補足:
- 表の api のファイルは T7（3 層構成への移行）後のパス。各機能のテスト（`test/usecase/<feature>.test.ts` を含む）も担当範囲。
- `application/routes/events.ts`（T2）と `application/routes/attendance.ts`（T3）はどちらも `/api/events` にマウントされている。
  T2 は `/:eventId/attendances/*` を登録しない。T3 は `/:eventId/attendances/:memberId` 以外を登録しない。
- 他機能のデータが必要な場合（例: T2 の詳細で出欠を集計する）は、自分の Repository の port と `datasource/d1/<feature>.ts` に書いてよい
  （schema.ts の import は自由）。他担当のファイルは編集しない。
- web の機能間連携:
  - T2 のイベント詳細は `features/attendance/AttendanceButtons`（T3）を import して置く。props は `AttendanceButtonsProps`（eventId, memberId, currentStatus）
  - T3 は出欠保存の成功後に `queryKeys.events.all` を invalidate する（一覧・詳細の人数が更新される）
  - T1 / T4 はログイン成功・初回登録成功時に `useSetLoggedIn()(me)` を呼んで `routes.events()` へ遷移する。ログアウト成功時は `useSetLoggedOut()`
- API の request/response 型は `packages/types` に**定義済み**。各担当は実装をこれに合わせる。

## 3. API の 3 層構成（decisions C21 / C22）

```text
            ┌──────────────┐        ┌───────────┐        ┌────────────────┐
 HTTP ───▶ │ application  │ ─────▶ │  usecase  │ ◀───── │   datasource   │
            │ Hono・zod    │  呼ぶ   │ 業務ルール │  実装   │ Drizzle/D1・   │
            │ Cookie・ログ │        │ と port    │        │ Resend・Crypto │
            └──────────────┘        └───────────┘        └────────────────┘
                    ▲                     ▲                       ▲
                    └──── index.ts / composition.ts（composition root）が組み立てる
```

| 層 | 責務 | 依存してよいもの |
|---|---|---|
| `application/` | Hono の route・middleware（requestLogger / provideUsecases / requireAuth / requireAdmin）・エラーハンドラ、zod によるリクエスト検証、Cookie、usecase の結果をレスポンス（JSON・ステータス）にすること、リクエストログ | hono、zod、`@minton/types`、usecase |
| `usecase/` | 機能ごとの業務ルール（権限の判定、Circle 境界、出欠の upsert ルール、招待の状態遷移、B3 / B4 / B5 / C11 / C16 など）と、そのために使う port（Repository・メール送信・Password・Token・時刻・ID・ログ）のインターフェース | `@minton/types`、usecase 内のファイルだけ |
| `datasource/` | port の実装（Drizzle + D1 の Repository、Resend / dev ログのメール送信、PBKDF2、Token の生成とハッシュ、ULID、時刻）と Drizzle スキーマ | drizzle-orm、ulid、WebCrypto、usecase（port の型） |

- 依存の向きは **application → usecase ← datasource**。usecase は application / datasource / composition を import しない。
  application は datasource を、datasource は application / Hono を import しない。
  ルートの `eslint.config.js` の `no-restricted-imports` で検査している（`npm run lint`）。
- **composition root**: `src/composition.ts` の `composeUsecases(env, requestLogger)` が、リクエストごとに env（D1 binding・vars・Secret）から
  datasource を組み立てて usecase に渡し、`Usecases` を返す。`application/middleware/usecases.ts`（provideUsecases）がこれを呼んで
  `c.var.usecases` に入れる。application は composition を直接 import せず、`src/index.ts` が `createApp({ composeUsecases, newId })` で渡す。
- **DI**: ライブラリは使わない。usecase は `create<Feature>Usecase(deps)` というファクトリで依存を引数で受け取り、メソッドを持つオブジェクトを返す
  （クラスは使わない。Repository の実装も `create<Feature>Repository(db)` で統一）。
- **port は usecase が実際に使うメソッドだけ**を持つ。汎用の `Repository<T>`・基底クラス・抽象ファクトリ・イベントバスは作らない。
  1 つの関数で足りる port は関数型にする（`Now` / `NewId` / `MailSender`）。
- エラーは usecase から `usecase/errors.ts` の `AppError`（validationError / unauthorized / forbidden / notFound / conflict / internalError）を throw する。
  application の `errorHandler` が ApiErrorResponse に変換する。
- **権限の判定は usecase が持つ**。admin 専用の usecase は先頭で `assertAdmin(member)` を呼ぶ。
  route の `requireAdmin` も同じ `assertAdmin` を使い、入力の検証より前に 401 / 403 を返す（判定順: 401 → 403 → 400）。
- ログ: usecase は port の `RequestLogger` で、リクエストログに操作対象を追加し（`addContext`）、requestId 付きのエラーログを出す（`error`）。
  実装は `application/logger.ts` の `requestLoggerFor(c)`。

### 層をまたぐ受け渡しについて（guardrails §7 / §15）
- usecase のメソッドが Repository を 1 回呼ぶだけになる箇所（Event 一覧、メンバー一覧の取得など）もあるが、
  ①権限の判定（assertAdmin）・Circle の決定（ログイン中の Member の circleId を使う）・時刻の取得を usecase に集めるため、
  ②route が datasource を直接使わないという規則に例外を作らないため、usecase を通す。usecase 1 機能 = 1 ファイルにまとめ、
  メソッドごとのファイルやクラスは作らない。
- 初回登録（`POST /api/invitations/:token/accept`）は「Token の検証（404）→ 入力の検証（400）→ 登録」の順を守るため、
  usecase の `prepareAccept(token)` が Token を検証して登録用の関数を返す 2 段構成にしている。

### 新しい機能（API）を追加するときの手順
1. `packages/types` に request / response のスキーマ・型と `apiPaths` を足す（共有ファイル。要相談）
2. `usecase/<feature>.ts`: Repository などの port（使うメソッドだけ）と `create<Feature>Usecase(deps)` を書く。
   権限の判定・Circle 境界・状態遷移などのルールはここに書く。Hono / Drizzle は import しない
3. `datasource/d1/<feature>.ts`: `create<Feature>Repository(db)` で port を実装する。**すべてのクエリを circleId で絞る**
4. `usecase/index.ts` の `Usecases` と `composition.ts` の `composeUsecases` に追加する
5. `application/routes/<feature>.ts`: `requireAuth` / `requireAdmin`、zod の検証、`c.get('usecases').<feature>.<method>(c.get('member'), ...)`、
   レスポンスへの変換を書き、`application/app.ts` にマウントする
6. テスト: `test/usecase/<feature>.test.ts`（fake の port で業務ルール・権限判定）と `test/<feature>/*.test.ts`（D1 を使う integration）

## 4. API の規約

### 契約
- パス: `packages/types/src/paths.ts` の `apiPaths`。スキーマ・型・ステータスは `packages/types/src/<feature>.ts` のコメントを参照
- 入力は必ず route で zod により検証する: `parseJsonBody(c, schema)` / `parseParams(c, schema)` / `parseOrThrow(schema, data)`（`application/errors.ts`）。
  失敗は自動で 400 VALIDATION_ERROR（`details` に `fieldErrors`）になる。usecase には検証済みの値を渡す
- 日時は UTC ISO 文字列で保存・返却（`usecase/time.ts` の `toUtcIso()` で正規化し、現在時刻は port の `now()` を使う。`Date#toISOString()` 形式）
- Email は `emailSchema`（trim + 小文字化）を通した値で保存・照合する（C5）
- ID は port の `newId()`（ULID。`datasource/id.ts`）

### Circle 境界（最重要: guardrails §2）
- 認証が必要な route は `requireAuth` / `requireAdmin` を付け、`c.var.member`（`{ id, circleId, role }`）を usecase に渡す
- usecase は Circle を常に `member.circleId` から決める。リクエストのボディやパスから受け取った Circle ID を信用しない
- **Repository の port のメソッドは必ず `circleId` を引数に取り、実装の WHERE に `circle_id = ?` を入れる。ID だけで取得・更新・削除しない**
  （例外は Token ハッシュで引く Session / Invitation。取得後の操作は取得した行の circleId で絞る）

  ```ts
  // datasource/d1/events.ts
  async find(circleId, eventId) {
    const row = await db.query.events.findFirst({
      where: and(eq(events.circleId, circleId), eq(events.id, eventId)),
    });
    return row && toEvent(row);
  },
  ```
- 別 Circle のリソースは「存在しない」と同じく 404（B14）。403 にしない（存在を開示しない）
- DB でも複合 FK `(circle_id, id)` により、別 Circle の Event / Member を組み合わせた Attendance・Session などは保存できない
- 認可は API で必ず検証する（web で非表示にするだけにしない）。admin 専用は route に `requireAdmin`（未ログイン 401、member 403）を付け、
  usecase でも `assertAdmin` を呼ぶ

### エラー
- `usecase/errors.ts` のヘルパーを throw する: `validationError()` 400 / `unauthorized()` 401 / `forbidden()` 403 / `notFound()` 404 / `conflict()` 409。
  それ以外の例外は 500 INTERNAL_ERROR になり、メッセージ・stack trace は返さない
- レスポンス形式は `ApiErrorResponse`: `{ "error": { "code": "NOT_FOUND", "message": "...", "details"?: {...} } }`
- `message` は Client に表示されるので日本語のユーザー向け文言にし、内部情報や秘密情報を入れない
- 同時リクエストの UNIQUE 制約違反は datasource で判定し（`isUniqueConstraintError(e)`）、port の戻り値（例: `'email_taken'`）で usecase に伝える

### ログ（guardrails §13）
- `requestLogger` が全リクエストを JSON 1 行で記録する: requestId / method / route（パターン）/ params（`token` 以外）/ status / durationMs /
  circleId / memberId / errorCode / timestamp。実パス・クエリ・ボディ・Cookie は記録しない
- 操作対象を追加するときは、route では `setLogContext(c, { eventId })`、usecase では `deps.log.addContext({ invitationId })`。
  追加のエラーログは usecase では `deps.log.error('event_name', {...})`、application では `log('error', 'event_name', {...})`
- Password / Session Token / Invitation Token / Password Hash / API キーをログに渡さない（キー名で自動 `[REDACTED]` されるが、それに頼らない）。
  例外: C7 / C23（`.dev.vars` に `DEV_MAIL_LOG=1` を置いた開発環境に限り招待 URL をログ出力してよい。`datasource/mail.ts` の devLogSender）。
  `DEV_MAIL_LOG` は wrangler.jsonc の vars・本番には置かない。フラグも `RESEND_API_KEY` も無い場合は送信エラー（C16 に従い revoked + 500）
- Cloudflare の invocation log（リクエスト URL を含む）は wrangler.jsonc の `observability.logs.invocation_logs: false` で無効にしている（C24。招待 Token が URL パスにあるため）。
  Workers Logs に残るのはアプリの構造化ログだけ

### 認証・Session（A2 / A3 / C1）
- Password（`datasource/password.ts`、port は `PasswordHasher`）: PBKDF2-SHA256、100,000 回、Salt 16 bytes、定数時間比較。
  Member が見つからないときも `verify(pw, null)` を呼んで時間差を作らない（`usecase/auth.ts`）
- Session: `usecase/session.ts` の `issueSession(deps, { circleId, memberId })` が Token を発行してハッシュを保存し、平文 Token を返す。
  Cookie は application の `sessionCookie.ts`（`setSessionCookie` / `clearSessionCookie` / `readSessionToken`）が扱う。
  Cookie は `session`、HttpOnly / SameSite=Lax / Path=/ / Secure（https 時）、有効期限 30 日固定（延長なし）
- 検証は `usecases.auth.authenticate(token)`（requireAuth が使う）。Session と Member は同じ Circle に限る
- Token（Session / Invitation）は port の `TokenService`（`datasource/crypto.ts` の `webCryptoTokens`: 256 bit の乱数、SHA-256）で作り、DB にはハッシュだけを保存する

## 5. web の規約
- 画面は `src/app/router.tsx` に全部登録済み。各担当は `features/<feature>/` のページの中身を実装する
- API 呼び出しは `lib/api.ts` の `api.get/post/put/delete` と `@minton/types` の `apiPaths` を使い、`features/<feature>/api.ts`（hooks）にまとめる。
  失敗は `ApiError`（`code` / `message` / `details.fieldErrors`）。表示は `errorMessage(e)`
- どの API でも 401 が返ると自動でログアウト状態になり、`RequireAuth` が `/login/<最後の circleLoginId>` へ送る（C2）
- queryKey は `lib/queryKeys.ts`、画面パスは `lib/routes.ts` を使う
- 日時の表示・入力は `lib/datetime.ts`（API は UTC、表示・入力は JST: B8）
- フォームは react-hook-form + `@hookform/resolvers/zod` で `packages/types` のスキーマを使う（Frontend の Validation は UX 用。API でも必ず検証される）
- モバイルファースト（guardrails §12）: レイアウトは `max-w-md`、ボタンは高さ 44px 以上（`Button` の既定）、主要操作を上部に、横スクロールなし
- shadcn/ui の部品は `components/ui/` にある（button, card, input, label, badge, dialog）。削除確認は `Dialog` を使う

## 6. テスト
- すべてルートで `npm run typecheck && npm run lint && npm test` が通ること
- **api の unit**（guardrails §11）: usecase を fake の port で直接テストする。`apps/api/test/usecase/<feature>.test.ts`（fake は `fakes.ts`）。
  権限の判定（admin のみ・他人の出欠 403）、別 Circle 404（fake の Repository も circleId で絞る）、招待の状態ごとの拒否などを書く
- **api の integration**（vitest + @cloudflare/vitest-pool-workers）: Migration 適用済みの D1 で書く。`apps/api/test/<feature>/*.test.ts`

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
  - `request(path, { method, body, cookie })` で `app` を直接呼ぶ。`sessionFromSetCookie(res)` で Set-Cookie の Session を取り出せる。
    `verifySessionToken(token)` で Session が有効か確かめられる
  - 生成される ID・Email・circleLoginId は一意なので、テスト間でデータを掃除しなくてよい（件数を数えるテストは自分の Circle で絞る）
  - 必ず書く観点: 正常系、Validation、未ログイン 401、権限 403、別 Circle 404（AC-12）
- **web**（vitest + jsdom + Testing Library）: `apps/web/src/**/*.test.tsx`。`src/test/render.tsx` の `renderRoute(path, { me })` で実際のルーターで描画し、
  fetch は `vi.stubGlobal('fetch', ...)` で差し替える
- **E2E**（Playwright）: `e2e/*.spec.ts`。`npm run test:e2e`（`npm test` には含めない）。スマホ（iPhone 13 / Pixel 7）とデスクトップの project がある。
  - `npm run test:e2e`（= `node e2e/run-local.mjs`）は、5173 / 8787 が空いていることを確認してからこの worktree の `npm run dev` を起動し、
    ローカル D1 に Migration を適用して Playwright を 1 worker で実行する（ポート使用中・`DEV_MAIL_LOG=1` が無いとき・`RESEND_API_KEY` 設定時は中止）。
    Playwright の引数はそのまま渡せる: `npm run test:e2e -- --project=mobile-safari`
  - 事前に `apps/api/.dev.vars`（`APP_BASE_URL` と `DEV_MAIL_LOG=1` を含む。`.dev.vars.example` のコピーでよい）を用意する。招待 URL は dev ログから取る（decisions C7 / C23）
  - テストデータは `e2e/support/helpers.ts`（seed CLI と API）でローカル D1 に毎回一意に作る
  初回は `npx playwright install chromium webkit`

## 7. ローカル起動

```sh
npm install
cp apps/api/.dev.vars.example apps/api/.dev.vars   # DEV_MAIL_LOG=1（招待 URL をログに出す: C23）と APP_BASE_URL が入っている
npm run db:migrate:local                            # ローカル D1 に Migration を適用（apps/api/.wrangler/ に保存）
npm run dev                                         # api: http://127.0.0.1:8787 / web: http://localhost:5173
curl http://localhost:5173/api/health               # → {"ok":true}（Vite proxy 経由で api に届く）
```

- 招待メールは `DEV_MAIL_LOG=1` なら実送信せず、招待 URL を wrangler dev のログ（`invitation_mail_dev`）に出す（C7 / C23）。
  本番では `DEV_MAIL_LOG` を置かず、`RESEND_API_KEY`（Secret）と `MAIL_FROM` を設定する。どちらも無いと招待作成は 500 になる
- web の dev サーバーは `/api` を wrangler dev に proxy する（同一オリジンなので Session Cookie がそのまま使える）
- Circle / admin の初期データは seed CLI（T1 が `apps/api/scripts/` に作成）で投入する
- `wrangler.jsonc` の `database_id` はプレースホルダ。remote の D1 作成・デプロイ・Secret 登録は別途行う

## 8. DB / Migration
- テーブル: circles / members / sessions / events / attendances / invitations（`apps/api/src/datasource/db/schema.ts`）
- 構造変更は `apps/api/migrations/NNNN_<name>.sql` を追加し、`schema.ts` も合わせて更新する（`test/foundation/schema-sync.test.ts` がカラムの一致を検査する）。
  Phase 1 で必要になった場合は ask で相談する
- 日時は UTC ISO 文字列。`attendances.status` は `attending` / `absent` のみ（未回答はレコードなし）。
  `invitations.status` は `pending` / `accepted` / `revoked`（expired は `expires_at <= 現在` で判定: B3）
