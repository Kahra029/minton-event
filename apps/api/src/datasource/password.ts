/**
 * Password Hash（decisions A3）: PBKDF2-SHA256（WebCrypto）、100,000 回、ユーザーごとのランダム Salt。
 * 保存形式: pbkdf2_sha256$<iterations>$<salt(base64)>$<hash(base64)>
 * usecase の PasswordHasher の実装（ログイン: T1、招待からの登録: T4）。Password をログに出さないこと。
 */
import type { PasswordHasher } from '../usecase/ports';
import { fromBase64, timingSafeEqual, toBase64 } from './crypto';

export const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;
const PREFIX = 'pbkdf2_sha256';

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return `${PREFIX}$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

/** 該当 Member がいないときに照合時間を揃えるためのダミー（中身に意味はない） */
const DUMMY_HASH = `${PREFIX}$${PBKDF2_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;

/**
 * Password を照合する（定数時間比較）。
 * storedHash が null（該当 Member なし）でも同じ計算をして false を返すので、
 * ログインで「Member が存在しない」と「Password 違い」を時間差で区別されにくい。
 */
export async function verifyPassword(password: string, storedHash: string | null): Promise<boolean> {
  const parsed = parse(storedHash ?? DUMMY_HASH) ?? parse(DUMMY_HASH)!;
  const actual = await derive(password, parsed.salt, parsed.iterations);
  const ok = timingSafeEqual(actual, parsed.hash);
  return storedHash !== null && ok;
}

function parse(stored: string): { iterations: number; salt: Uint8Array; hash: Uint8Array } | null {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations <= 0 || iterations > PBKDF2_ITERATIONS) return null;
  try {
    return { iterations, salt: fromBase64(parts[2]), hash: fromBase64(parts[3]) };
  } catch {
    return null;
  }
}

export const pbkdf2Password: PasswordHasher = { hash: hashPassword, verify: verifyPassword };
