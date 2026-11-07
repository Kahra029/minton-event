/**
 * API のエントリポイント（wrangler.jsonc の main）。
 * application（Hono）に composition root と ID 生成を渡して app を作る。構成は docs/architecture.md。
 */
import { createApp } from './application/app';
import { composeUsecases } from './composition';
import { newId } from './datasource/id';

const app = createApp({ composeUsecases, newId });

export default app;
