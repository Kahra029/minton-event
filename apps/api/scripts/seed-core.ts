/**
 * seed CLI（decisions A5 / C10）の中身。Node（scripts/seed.ts）と vitest（Workers）の両方から import するので、
 * WebCrypto / btoa など両方にある API と zod だけを使う（src/ は拡張子なし import のため Node から直接読めない）。
 *
 * - Password Hash は src/lib/password.ts と同じ形式（pbkdf2_sha256$<iterations>$<salt>$<hash>）。
 *   互換性は test/auth/seed.test.ts で verifyPassword により検証している。
 * - 入力の制約は decisions C5 / packages/types と同じ（同じくテストで一致を確認）。
 */
import { z } from 'zod';

export const SEED_PBKDF2_ITERATIONS = 100_000;
export const SEED_LIMITS = {
  circleLoginIdMax: 64,
  passwordMin: 8,
  passwordMax: 128,
  displayNameMin: 1,
  displayNameMax: 50,
  emailMax: 254,
} as const;

export const seedInputSchema = z.object({
  circleLoginId: z.string().trim().min(1).max(SEED_LIMITS.circleLoginIdMax),
  circleName: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().max(SEED_LIMITS.emailMax).email(),
  displayName: z.string().trim().min(SEED_LIMITS.displayNameMin).max(SEED_LIMITS.displayNameMax),
  password: z.string().min(SEED_LIMITS.passwordMin).max(SEED_LIMITS.passwordMax),
});
export type SeedInput = z.infer<typeof seedInputSchema>;

/** 入力を検証する。エラーは「項目: 理由」の配列（入力値そのものは含めない） */
export function validateSeedInput(
  raw: Record<string, unknown>,
): { ok: true; value: SeedInput } | { ok: false; errors: string[] } {
  const result = seedInputSchema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
}

function toBase64(buf: Uint8Array): string {
  let s = '';
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s);
}

/** src/lib/password.ts の hashPassword と同じ形式の PBKDF2-SHA256 ハッシュ（A3） */
export async function hashSeedPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: SEED_PBKDF2_ITERATIONS },
    key,
    256,
  );
  return `pbkdf2_sha256$${SEED_PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(new Uint8Array(bits))}`;
}

const q = (v: string) => `'${v.replace(/'/g, "''")}'`;

/** Circle と最初の admin を作る SQL（circleLoginId が既にあれば UNIQUE 制約で失敗する） */
export function buildSeedSql(params: {
  circleId: string;
  memberId: string;
  now: string;
  input: Omit<SeedInput, 'password'>;
  passwordHash: string;
}): string[] {
  const { circleId, memberId, now, input, passwordHash } = params;
  return [
    `INSERT INTO circles (id, circle_login_id, name, created_at, updated_at) VALUES (${q(circleId)}, ${q(input.circleLoginId)}, ${q(input.circleName)}, ${q(now)}, ${q(now)});`,
    `INSERT INTO members (id, circle_id, email, display_name, role, password_hash, created_at, updated_at) VALUES (${q(memberId)}, ${q(circleId)}, ${q(input.email)}, ${q(input.displayName)}, 'admin', ${q(passwordHash)}, ${q(now)}, ${q(now)});`,
  ];
}
