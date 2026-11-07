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
