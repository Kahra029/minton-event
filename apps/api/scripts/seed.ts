/**
 * 初期 Circle と最初の admin を作る seed CLI（decisions A5 / C10）。運用者が実行する。
 *
 *   cd apps/api
 *   node scripts/seed.ts --circle-login-id <id> --circle-name <名前> --email <email> --name <表示名> [--remote]
 *
 * - Password は引数・環境変数では受け取らない（コマンド履歴・プロセス一覧に残さない）。
 *   端末なら非表示で 2 回入力、パイプ / リダイレクトなら標準入力の 1 行目を使う。
 * - 既定はローカル D1（wrangler d1 execute --local）。--remote で Cloudflare 上の D1。
 * - SQL は権限 600 の一時ファイル経由で wrangler に渡し、終了時に削除する（Hash をコマンドラインに載せない）。
 * - Node 22.18 以上（型ストリップ）で .ts を直接実行する。
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ulid } from 'ulid';
import { buildSeedSql, hashSeedPassword, validateSeedInput } from './seed-core.ts';

const USAGE =
  '使い方: node scripts/seed.ts --circle-login-id <id> --circle-name <サークル名> --email <email> --name <表示名> [--remote]\n' +
  '  Password は実行後に非表示で入力する（パイプ / リダイレクト時は標準入力の 1 行目）';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** 端末で非表示入力する */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false);
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

/** パイプ / リダイレクトされた標準入力の 1 行目 */
async function readFirstLineFromStdin(): Promise<string> {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.split(/\r?\n/)[0] ?? '';
}

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) return readFirstLineFromStdin();
  const first = await promptHidden('admin の Password（8〜128 文字）: ');
  const second = await promptHidden('確認のためもう一度: ');
  if (first !== second) fail('Password が一致しません');
  return first;
}

function parseCliArgs() {
  try {
    return parseArgs({
      options: {
        'circle-login-id': { type: 'string' },
        'circle-name': { type: 'string' },
        email: { type: 'string' },
        name: { type: 'string' },
        remote: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
      strict: true,
    }).values;
  } catch (e) {
    return fail(`${(e as Error).message}\n${USAGE}`);
  }
}

async function main() {
  const values = parseCliArgs();
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const required = ['circle-login-id', 'circle-name', 'email', 'name'] as const;
  const missing = required.filter((k) => !values[k]);
  if (missing.length) fail(`必須の引数がありません: ${missing.map((k) => `--${k}`).join(', ')}\n${USAGE}`);

  const password = await readPassword();
  const checked = validateSeedInput({
    circleLoginId: values['circle-login-id'],
    circleName: values['circle-name'],
    email: values.email,
    displayName: values.name,
    password,
  });
  if (!checked.ok) fail(`入力内容に誤りがあります:\n  ${checked.errors.join('\n  ')}`);
  const { password: pw, ...input } = checked.value;

  const sql = buildSeedSql({
    circleId: ulid(),
    memberId: ulid(),
    now: new Date().toISOString(),
    input,
    passwordHash: await hashSeedPassword(pw),
  }).join('\n');

  const target = values.remote ? 'REMOTE（Cloudflare 上の D1）' : 'LOCAL（apps/api/.wrangler）';
  console.log(`Circle と admin を作成します [${target}]`);
  console.log(`  circleLoginId: ${input.circleLoginId} / Circle 名: ${input.circleName}`);
  console.log(`  admin: ${input.displayName} <${input.email}>`);

  const dir = fs.mkdtempSync(path.join(tmpdir(), 'minton-seed-'));
  const file = path.join(dir, 'seed.sql');
  let succeeded = false;
  try {
    fs.writeFileSync(file, sql, { mode: 0o600 });
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', values.remote ? '--remote' : '--local', '--file', file], {
      cwd: path.resolve(import.meta.dirname, '..'),
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    succeeded = true;
  } catch {
    // 下で一時ファイルを消してから終了する
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(dir);
  }
  if (!succeeded) fail('作成に失敗しました（Migration 未適用、または circleLoginId が既に存在する可能性があります）');
  console.log(`作成しました。ログインURL: /login/${encodeURIComponent(input.circleLoginId)}`);
}

await main();
