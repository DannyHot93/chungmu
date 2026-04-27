// ======================================================
// YouTube search.list + videos.list 결과 인메모리 캐시 (quota 절감)
// 서버 프로세스 단위, TTL 만료 후 재요청
// ======================================================

const TTL_MS = 60 * 60 * 1000; // 1시간
const MAX_KEYS = 500;

type Entry<T> = { expiry: number; value: T };

const store = new Map<string, Entry<unknown>>();

function prune(): void {
  const now = Date.now();
  if (store.size <= MAX_KEYS) return;
  for (const [k, e] of store) {
    if (e.expiry <= now) store.delete(k);
    if (store.size <= Math.floor(MAX_KEYS * 0.6)) break;
  }
  while (store.size > MAX_KEYS) {
    const first = store.keys().next().value;
    if (first === undefined) break;
    store.delete(first);
  }
}

export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key) as Entry<T> | undefined;
  if (!e) return undefined;
  if (Date.now() > e.expiry) {
    store.delete(key);
    return undefined;
  }
  return e.value;
}

export function cacheSet<T>(key: string, value: T): void {
  prune();
  store.set(key, { expiry: Date.now() + TTL_MS, value });
}

export function searchListKey(query: string, maxResults: number): string {
  return `q:${maxResults}:${query.trim().toLowerCase()}`;
}

export function trackMatchKey(artist: string, title: string): string {
  return `tr:${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}
