import { factory } from 'ulid';
import type { NewId } from '../usecase/ports';

/**
 * ulid の既定の乱数源検出は Workers（wrangler dev）で Node の crypto.randomBytes を選んで失敗するため、
 * WebCrypto を明示的に渡す。
 */
const ulid = factory(() => {
  const buf = new Uint8Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0xff;
});

/** 主キー用の ID（ULID） */
export const newId: NewId = () => ulid();
