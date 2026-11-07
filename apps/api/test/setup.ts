import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// すべてのテストファイルの前に Migration を適用する（適用済みならスキップされる）
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
