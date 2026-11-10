/**
 * 最後にログインした circleLoginId の保持（decisions C2）。
 * ログイン成功時に保存し、未ログイン時は /login/<保存値> へリダイレクトする。ログアウトでは消さない。
 */
const STORAGE_KEY = 'minton-event:lastCircleLoginId';

export function loadLastCircleLoginId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveLastCircleLoginId(circleLoginId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, circleLoginId);
  } catch {
    // private モード等で保存できなくても動作は続ける
  }
}
