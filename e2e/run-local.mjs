// E2E をこの worktree のコードとローカル D1 に対して実行する（担当: T5）。
//
//   npm run test:e2e [-- playwright test の引数...]（= node e2e/run-local.mjs）
//   例: npm run test:e2e -- --project=mobile-chrome
//
// 1. 5173 / 8787 が空いていることを確認する（他の worktree のサーバーを使わない。使用中なら中止）
// 2. apps/api/.dev.vars を確認する（APP_BASE_URL と DEV_MAIL_LOG=1 が必須。RESEND_API_KEY が設定されていたら実送信を避けるため中止）
// 3. ローカル D1 に Migration を適用する（--local のみ。remote には触れない）
// 4. `npm run dev` を起動し、出力を権限 600 の一時ファイルに保存する（招待 URL は dev ログから取る: decisions C7 / C23）
// 5. playwright test を E2E_DEV_LOG 付き・既定 1 worker で実行し、終了後にサーバーを止めてログを削除する
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
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
if (/^\s*RESEND_API_KEY\s*=\s*\S/m.test(devVars)) {
  fail('apps/api/.dev.vars に RESEND_API_KEY が設定されています。E2E は招待メールを実送信しないよう未設定で実行します');
}
if (!/^\s*DEV_MAIL_LOG\s*=\s*"?1"?\s*$/m.test(devVars)) {
  fail('apps/api/.dev.vars に DEV_MAIL_LOG=1 がありません。招待 URL を dev ログから取るため必要です（decisions C23）');
}
if (!/^\s*APP_BASE_URL\s*=\s*\S/m.test(devVars)) {
  fail('apps/api/.dev.vars に APP_BASE_URL がありません（例: APP_BASE_URL=http://localhost:5173）');
}

const migrate = spawnSync('npm', ['run', 'db:migrate:local'], { cwd: root, stdio: 'inherit' });
if (migrate.status !== 0) fail('ローカル D1 への Migration 適用に失敗しました');

const logDir = fs.mkdtempSync(path.join(tmpdir(), 'minton-e2e-'));
const logPath = path.join(logDir, 'dev.log');
const logFd = fs.openSync(logPath, 'a', 0o600);

// detached: npm と子孫をプロセスグループごと止める
const dev = spawn('npm', ['run', 'dev'], { cwd: root, stdio: ['ignore', logFd, logFd], detached: true });
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
  fs.closeSync(logFd);
  fs.rmSync(logDir, { recursive: true, force: true });
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
    console.error(fs.readFileSync(logPath, 'utf8').split('\n').slice(-30).join('\n'));
    throw new Error('dev サーバーが起動しませんでした');
  }
  // seed CLI（wrangler d1 execute --local）を複数 worker から同時に走らせるとローカル D1 が SQLITE_BUSY になるため、既定は 1 worker
  const args = process.argv.slice(2);
  if (!args.some((a) => a.startsWith('--workers') || a === '-j')) args.push('--workers=1');
  const result = spawnSync('npx', ['playwright', 'test', ...args], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, E2E_DEV_LOG: logPath },
  });
  code = result.status ?? 1;
} catch (e) {
  console.error(`[e2e] ${e.message}`);
} finally {
  cleanup();
}
process.exit(code);
