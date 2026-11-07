# minton-event

バドミントンサークル出欠管理アプリ（MVP）。npm workspaces のモノレポ。

- `apps/api` — Hono + Cloudflare Workers + D1 + Drizzle
- `apps/web` — Vite + React + Tailwind + shadcn/ui
- `packages/types` — zod スキーマ / API 型（api と web で共有）

構成・規約・ローカル起動手順は [docs/architecture.md](docs/architecture.md)、決定事項は [docs/decisions.md](docs/decisions.md)。

```sh
npm install
npm run db:migrate:local
npm run dev
npm run typecheck && npm run lint && npm test
```

## 初期 Circle / admin の作成（seed CLI）

運用者が最初の Circle と admin を作る（decisions A5）。Node 22.18 以上。Migration 適用後に `apps/api` で実行する。

```sh
cd apps/api
node scripts/seed.ts --circle-login-id <circleLoginId> --circle-name <サークル名> --email <admin の Email> --name <表示名>
# → admin の Password を非表示で 2 回入力（8〜128 文字）
# → 完了するとログインURL /login/<circleLoginId> が表示される
```

- 既定はローカル D1（`wrangler d1 execute --local`）。
- **Password は引数・環境変数で渡さない**（シェル履歴・プロセス一覧に残るため）。端末で入力するか、
  パスワードマネージャ等からパイプする: `<pw を出力するコマンド> | node scripts/seed.ts ...`（標準入力の 1 行目を使う）。
- 同じ circleLoginId が既にある場合は失敗し、何も作らない。

### remote（Cloudflare 上の D1）

remote の D1 作成・`wrangler.jsonc` の `database_id` 設定・`wrangler d1 migrations apply DB --remote` を済ませ、`wrangler login` した状態で `--remote` を付ける。

```sh
cd apps/api
node scripts/seed.ts --remote --circle-login-id <circleLoginId> --circle-name <サークル名> --email <email> --name <表示名>
```
