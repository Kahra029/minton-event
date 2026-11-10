# デプロイ手順

本番は Worker 1 つ（`minton-event-api`）で Web（静的アセット）と API（`/api/*`）を配信し、
`https://minton-event-api.<account>.workers.dev` で公開する（独自ドメインなし。decisions C30）。
構成の説明は [architecture.md](architecture.md) の「本番の構成」。

- D1 は作成済み（`minton-event`、`database_id` は `apps/api/wrangler.jsonc` に設定済み: C12 / C14）
- 設定する値は `APP_BASE_URL` だけ。本番 URL をリポジトリに書かないため Secret で入れる（C37。メール送信の Secret は C32 で廃止）
- 試行回数制限（C33）は `wrangler.jsonc` の `ratelimits` でデプロイ時に有効になる。ダッシュボードでの設定は不要

コマンドはリポジトリのルートで実行する（`apps/api` で実行するものは明記する）。

## 0. 準備

```sh
npm install
cd apps/api && npx wrangler login && npx wrangler whoami   # デプロイ先のアカウントを確認
cd ../..
npm run typecheck && npm run lint && npm test
```

## 1. remote の D1 に Migration を適用する

```sh
cd apps/api
npx wrangler d1 migrations apply DB --remote
npx wrangler d1 migrations list DB --remote   # 未適用が無いこと
cd ../..
```

## 2. デプロイする

```sh
npm run deploy   # = npm run build（apps/web/dist を作る）→ apps/api で wrangler deploy
```

出力に `https://minton-event-api.<account>.workers.dev` と、バインディング（`DB`、`AUTH_RATE_LIMITER`）が出ることを確認する。
`<account>` はアカウントの workers.dev サブドメイン。

## 3. APP_BASE_URL を設定する

招待 URL はこの値から作る（C17。未設定だと招待作成が 500 になる）。2. の出力の URL を Secret として入れる（C37）。
Secret は次回以降の `wrangler deploy` でも消えないので、最初の 1 回だけでよい。

```sh
cd apps/api
npx wrangler secret put APP_BASE_URL
# → https://minton-event-api.<account>.workers.dev を入力（末尾の / は付けても付けなくてよい）
npx wrangler secret list   # APP_BASE_URL があること
cd ../..
```

- 本番 URL は `wrangler.jsonc` に書かない（公開リポジトリのため。C37）
- Secret を入れると Worker の新しいバージョンが自動で反映されるので、再デプロイは不要

## 4. 初期 Circle / admin を作る（seed --remote）

```sh
cd apps/api
node scripts/seed.ts --remote --circle-login-id <circleLoginId> --circle-name <サークル名> --email <admin の Email> --name <表示名>
# → admin の Password を非表示で 2 回入力
cd ../..
```

詳細は [README.md](../README.md) の「初期 Circle / admin の作成」。

## 5. 動作確認

1. `https://minton-event-api.<account>.workers.dev/api/health` が `{"ok":true}` を返す
2. `https://minton-event-api.<account>.workers.dev/login/<circleLoginId>` を開き、admin でログインできる
   （`/events` などのパスを直接開いても画面が出る: SPA のフォールバック）
3. メンバー一覧から招待すると、招待 URL（`https://minton-event-api.<account>.workers.dev/invitations/...`）とコピーボタンが出る
4. 別のブラウザ（シークレットウィンドウなど）でその URL を開き、初回登録できる。確認用の招待・Member は MVP では削除できない（B11）ので、
   実在のメンバーで確認するか、確認用の Circle を seed で別に作る

## 6. Workers Logs に Token が出ていないことを確認する

guardrails §13 / C24 / C31 の確認。ダッシュボードの Workers & Pages → `minton-event-api` → Logs（Workers Logs）で、5. の操作の時間帯を見る。

- invocation log（リクエスト URL を含む）が無く、アプリの構造化ログ（JSON 1 行: `requestId` / `method` / `route` / `status` など）だけがあること
  （`wrangler.jsonc` の `observability.logs.invocation_logs: false`）
- 招待の受け入れ・招待情報の取得のログが、実パスではなく `route` のパターン（`/api/invitations/:token/accept` など）で記録され、`params` に `token` が無いこと
- 5. で表示された招待 URL の Token 部分（`/invitations/` の後ろ）でログを検索し、1 件も見つからないこと
- `password` / `session` / `invitationUrl` の値がログに無いこと（キーがあっても値は `[REDACTED]`）

## 補足

- `wrangler tail` はリクエスト URL（招待 Token を含む）を手元の端末に表示する。出力を共有・保存しない
- 試行回数制限: 同じ IP から 60 秒に 10 回を超えるログイン / 招待の受け入れは 429（「試行回数が多すぎます。しばらくしてから再度お試しください」）。
  1 分待てば再度試せる
