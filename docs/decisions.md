# 決定事項

仕様書（`.orca/drops/badminton_*.md`）の未決事項について、ユーザーが決定した内容を記録する。
ここに無い事項は未決とし、実装前にユーザーへ提案・確認する。

決定日: 2026-11-07

## 技術構成

| 項目 | 決定 |
|---|---|
| フロント | React + TypeScript（Vite） |
| バック | Hono（TypeScript） |
| DB | Cloudflare D1 |
| ホスティング | Cloudflare Workers + Pages |
| ドメイン | Cloudflare Registrar |
| リポジトリ構成 | minton-scheduler と同様（npm workspaces: `apps/api`, `apps/web`, `packages/types`） |
| ライブラリ | minton-scheduler と同じ: Drizzle ORM, zod, dayjs, ulid, TanStack Query, react-hook-form, React Router, Tailwind CSS, shadcn/ui（Radix UI, lucide-react, class-variance-authority, clsx, tailwind-merge を含む）, ESLint |
| テスト | vitest、@cloudflare/vitest-pool-workers（D1 integration）、Playwright（E2E）（2026-11-07 決定） |

## 認証・基盤

| # | 項目 | 決定 |
|---|---|---|
| A2 | セッション | D1 にセッションを保存し、HttpOnly Cookie で渡す。セッションに Circle ID を持たせる。ログアウトでサーバー側から無効化 |
| A3 | Password Hash | PBKDF2-SHA256（WebCrypto）、100,000 回、ユーザーごとにランダムな Salt |
| A4 | 招待メール | Resend。API キーは Workers Secret。開発環境では実送信せずログ出力 |
| A5 | 初期 Circle / admin 作成 | 運用者が実行する seed 用 CLI スクリプト |

## ドメインルール

| # | 項目 | 決定 |
|---|---|---|
| B1 | Event 削除 | 物理削除。Attendance は FK `ON DELETE CASCADE` |
| B2 | Invitation 有効期限 | 7 日 |
| B3 | expired 状態 | DB に保存せず、`Expires At` と比較して判定 |
| B4 | revoked / 再送 | MVP では実装しない。同じ Email に再招待した場合、既存の pending を無効化 |
| B5 | 既存 Member の Email への招待 | Conflict。pending 中の Email は B4 に従う |
| B6 | Event Title | 任意。未入力時は日時・場所を見出しに表示 |
| B7 | Event 一覧 | 今後の Event のみ、開始日時の昇順 |
| B8 | タイムゾーン | DB は UTC、表示は JST |
| B9 | ログアウト | 実装する |
| B10 | パスワード再設定 | MVP では実装しない（運用手順は未決。B5 と衝突するため要検討） |
| B11 | Member 削除 / Role 変更 | MVP では実装しない |
| B12 | 存在しない circleLoginID | 404。ログイン失敗の文言は「メールアドレスまたはパスワードが違います」に統一 |
| B13 | 日時の Validation | 終了日時 > 開始日時 のみ |
| B14 | 別 Circle のリソース指定 | 404 Not Found（存在を開示しない） |

## 追加決定（2026-11-07）

| # | 項目 | 決定 |
|---|---|---|
| C1 | Session 有効期限 | 30 日固定。アクセスによる延長はしない（期限切れで再ログイン） |
| C2 | web の circleLoginId 保持 | ログイン成功時に最後の circleLoginId を localStorage に保存。未ログイン時は `/login/<保存値>` へリダイレクト。保存値が無ければ「ログインURLを確認してください」の案内画面。ログアウト後も同様 |
| C3 | web テスト Library | @testing-library/react、@testing-library/jest-dom、jsdom を devDependencies に追加 |
| C4 | 「今後の Event」（B7） | `end_at > 現在`（開催中を含む） |
| C5 | 入力値の制約 | Password 8〜128 文字、Display Name 1〜50 文字、Location 必須 1〜100 文字、Title 0〜100 文字。Email は trim + 小文字化して保存・照合 |
| C6 | メンバー一覧 API | 登録済み Member と未登録 Invitation を別配列で返す。Invitation は pending / expired（期限切れ表示）のみ。accepted・revoked は出さない |
| C7 | dev の招待 URL ログ | 開発環境（RESEND_API_KEY 未設定時）に限り、招待 URL（Token を含む）をログ出力してよい（A4 と guardrails §13 の衝突に対する例外）。本番では出さない |
| C8 | Event 詳細の Member 並び順 | 全 Member（未回答含む）を Display Name 昇順 |
| C9 | 招待からの初回登録後 | Session を発行してログイン状態にし、イベント一覧へ遷移 |
| C10 | 担当 | seed CLI は T1、メール送信は T4 |
| C11 | 無効な招待 Token | 存在しない・accepted 済み・revoked・期限切れのすべてで 404 NOT_FOUND（理由を開示しない）。画面は「この招待URLは無効です」。accept 時に同じ Circle + Email の Member が既にいれば 409 |
| C12 | 本番 D1 | minton-scheduler と同じ Cloudflare アカウントを使うが、D1 データベースは別に作る（`wrangler d1 create minton-event`）。テーブル名（members, events）と Migration 名（0001_init.sql）が scheduler と衝突するため、DB は共有しない。作成と `database_id` の設定はユーザーが行う |
| C13 | 存在しない circleLoginId の文言 | 「サークルが見つかりません」（404） |
| C14 | 本番 D1 の作成 | 2026-11-07 に `minton-event`（APAC、database_id `ed8ab48a-beea-4cfd-b7d4-8693484d2eaf`）を作成し wrangler.jsonc に設定済み。remote への Migration 適用・デプロイはユーザーが行う |
| C15 | 招待メールの送信元 | wrangler.jsonc の vars に `MAIL_FROM` を追加（値はデプロイ時にユーザーが設定）。本番で未設定なら送信エラー |
| C16 | 招待メールの送信失敗時 | その Invitation を revoked にしてから 500 INTERNAL_ERROR |
| C17 | 招待 URL の origin | リクエストからではなく設定値 `APP_BASE_URL`（vars）から生成。未設定なら招待作成をエラーにする（URL を推測しない） |
| C18 | 招待で作成される Member の Role | member 固定 |
| C19 | E2E の実行 | `npm run test:e2e` で `node e2e/run-local.mjs` を実行する（dev ログから招待 URL を取得するため）。ローカル D1 の SQLITE_BUSY 回避のため並列数は 1 |
| C20 | セキュリティレビュー（T6） | Codex ではなく Claude で実施 |
| C21 | API のディレクトリ構成 | apps/api を application / usecase / datasource の 3 層に分ける（Clean Architecture 風）。application = Hono の route・middleware・リクエストの検証・レスポンスへの変換。usecase = 業務ルールと、使うデータアクセスのインターフェース（port）。datasource = Drizzle / D1・Resend・WebCrypto を使った実装。依存の向きは application → usecase ← datasource。apps/web は今の機能ごとの構成のまま |
| C22 | DI | ライブラリを使わない。依存を引数で渡し、依存を組み立てる関数（composition root）でリクエストごとに組み立てて、Hono の c.var に入れる |
| C23 | T6 M-1: dev メール判定 | 明示的なフラグ（`.dev.vars` にだけ置く）で dev のログ出力を有効にする。フラグも RESEND_API_KEY も無い場合は送信エラー（C16 に従い revoked + 500）。C7 の「RESEND_API_KEY 未設定時」はこのフラグ判定に置き換える |
| C24 | T6 M-2: invocation log | wrangler.jsonc で `observability.logs.invocation_logs: false`。アプリの構造化ログだけを残す |
| C25 | T6 L-1: ログイン試行回数制限 | コード変更なし。デプロイ時にユーザーが Cloudflare Rate Limiting で `/api/auth/login` と `/api/invitations/*` を制限する |
| C26 | T6 L-2: 期限切れ Session / Invitation の削除 | MVP では対応しない |
| C27 | T6 L-3: circleLoginId の存在判別 | 対応しない（B12 / C13 どおり） |
| C28 | T6 L-4: ID 生成の乱数の偏り | 修正する |
