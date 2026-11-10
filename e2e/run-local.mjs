// E2E をこの worktree のコードとローカル D1 に対して実行する（担当: T5）。
//
//   npm run test:e2e [-- playwright test の引数...]（= node e2e/run-local.mjs）
//   例: npm run test:e2e -- --project=mobile-chrome
//
// 1. 5173 / 8787 が空いていることを確認する（他の worktree のサーバーを使わない。使用中なら中止）
// 2. apps/api/.dev.vars を確認する（APP_BASE_URL が必須）
// 3. ローカル D1 に Migration を適用する（--local のみ。remote には触れない）
// 4. `npm run dev` を起動する（招待 URL は画面から取るので、dev ログは起動失敗時の表示にだけ使う: decisions C32）
// 5. playwright test を既定 1 worker で実行し、終了後にサーバーを止める
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const PORTS = [5173, 8787];
const HEALTH_URL = 'http://localhost:5173/api/health';

function fail(message) {
  console.error(`[e2e] ${message}`);
  process.exit(1);
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

for (const port of PORTS) {
  if (await portInUse(port)) {
    fail(`ポート ${port} が使用中です。他の worktree のサーバーに対して実行しないよう中止します`);
  }
}

const devVarsPath = path.join(root, 'apps/api/.dev.vars');
if (!fs.existsSync(devVarsPath)) {
  fail('apps/api/.dev.vars がありません。`cp apps/api/.dev.vars.example apps/api/.dev.vars` してください');
}
const devVars = fs.readFileSync(devVarsPath, 'utf8');
if (!/^\s*APP_BASE_URL\s*=\s*\S/m.test(devVars)) {
  fail('apps/api/.dev.vars に APP_BASE_URL がありません（例: APP_BASE_URL=http://localhost:5173）');
}

const migrate = spawnSync('npm', ['run', 'db:migrate:local'], { cwd: root, stdio: 'inherit' });
if (migrate.status !== 0) fail('ローカル D1 への Migration 適用に失敗しました');

// detached: npm と子孫をプロセスグループごと止める
const dev = spawn('npm', ['run', 'dev'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
// 起動に失敗したときに表示するため、出力の末尾だけを覚えておく
const recentOutput = [];
for (const stream of [dev.stdout, dev.stderr]) {
  stream.on('data', (buf) => {
    recentOutput.push(...buf.toString().split('\n').filter(Boolean));
    recentOutput.splice(0, Math.max(0, recentOutput.length - 30));
  });
}
let devExited = false;
dev.on('exit', () => {
  devExited = true;
});

function cleanup() {
  try {
    process.kill(-dev.pid, 'SIGTERM');
  } catch {
    // 既に終了している
  }
}
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (devExited) return false;
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) return true;
    } catch {
      // 起動待ち
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

let code = 1;
try {
  if (!(await waitForHealth(120_000))) {
    console.error(recentOutput.join('\n'));
    throw new Error('dev サーバーが起動しませんでした');
  }
  // seed CLI（wrangler d1 execute --local）を複数 worker から同時に走らせるとローカル D1 が SQLITE_BUSY になるため、既定は 1 worker
  const args = process.argv.slice(2);
  if (!args.some((a) => a.startsWith('--workers') || a === '-j')) args.push('--workers=1');
  const result = spawnSync('npx', ['playwright', 'test', ...args], { cwd: root, stdio: 'inherit' });
  code = result.status ?? 1;
} catch (e) {
  console.error(`[e2e] ${e.message}`);
} finally {
  cleanup();
}
process.exit(code);
