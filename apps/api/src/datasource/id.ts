import { factory, type PRNG } from 'ulid';
import type { NewId } from '../usecase/ports';

/** 1 byte の乱数を返す関数 */
export type RandomByte = () => number;

const webCryptoByte: RandomByte = () => {
  const buf = new Uint8Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
};

/**
 * 1 byte の乱数を [0, 1) の値にする（decisions C28）。
 * ulid は `Math.floor(prng() * 32)` で文字を選ぶ。byte / 256 なら 256 通りが 32 文字に 8 通りずつ写り、偏らない
 * （以前の byte / 0xff は 255 だけが 1.0 になり、末尾の文字に寄っていた）。
 */
export function prngFromBytes(randomByte: RandomByte): PRNG {
  return () => randomByte() / 256;
}

/**
 * ulid の既定の乱数源検出は Workers（wrangler dev）で Node の crypto.randomBytes を選んで失敗するため、
 * WebCrypto を明示的に渡す。
 */
const ulid = factory(prngFromBytes(webCryptoByte));

/** 主キー用の ID（ULID） */
export const newId: NewId = () => ulid();
