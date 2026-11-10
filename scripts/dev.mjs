// api（wrangler dev :8787）と web（vite :5173）を同時に起動する。Ctrl-C で両方止まる。
import { spawn } from 'node:child_process';

const procs = [
  ['api', ['run', 'dev', '--workspace', 'apps/api']],
  ['web', ['run', 'dev', '--workspace', 'apps/web']],
].map(([name, args]) => {
  // detached: 子をプロセスグループのリーダーにし、終了時にグループごと止める（npm の子孫を残さない）
  const p = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const prefix = (stream, out) =>
    stream.on('data', (buf) => {
      for (const line of buf.toString().split('\n')) if (line) out.write(`[${name}] ${line}\n`);
    });
  prefix(p.stdout, process.stdout);
  prefix(p.stderr, process.stderr);
  return p;
});

let exiting = false;
const stopAll = (code = 0) => {
  if (exiting) return;
  exiting = true;
  for (const p of procs) {
    try {
      process.kill(-p.pid, 'SIGTERM');
    } catch {
      // 既に終了している
    }
  }
  setTimeout(() => process.exit(code), 500);
};
for (const p of procs) p.on('exit', (code) => stopAll(code ?? 0));
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
