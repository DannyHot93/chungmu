// ======================================================
// 음악 검색: Gemini+Tavily+YouTube — 단일곡 후보만
// ======================================================

import { runMoodTrackPipeline } from "./moodSearchPipeline";
import { normalizeTrackKey } from "./trackKey";
import type { MusicSearchResultItem } from "@/types";

// ── 파이프라인 결과 인메모리 캐시 ─────────────────────────────
// 같은 키워드+maxFinal 조합은 TTL(30분) 안에 재실행하지 않음
// → Gemini/Tavily/YouTube 호출을 모두 생략할 수 있음
const PIPELINE_TTL_MS = 30 * 60 * 1000; // 30분
const PIPELINE_MAX_KEYS = 200;

type PipelineEntry = { expiry: number; value: MusicSearchResultItem[] };
const pipelineCache = new Map<string, PipelineEntry>();

function pipelineCacheKey(keyword: string, maxFinal: number): string {
  return `${maxFinal}:${keyword.trim().toLowerCase()}`;
}

function pipelineCacheGet(keyword: string, maxFinal: number): MusicSearchResultItem[] | undefined {
  const key = pipelineCacheKey(keyword, maxFinal);
  const e = pipelineCache.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiry) {
    pipelineCache.delete(key);
    return undefined;
  }
  return e.value;
}

function pipelineCacheSet(keyword: string, maxFinal: number, value: MusicSearchResultItem[]): void {
  if (pipelineCache.size >= PIPELINE_MAX_KEYS) {
    const now = Date.now();
    for (const [k, e] of pipelineCache) {
      if (e.expiry <= now) pipelineCache.delete(k);
      if (pipelineCache.size < Math.floor(PIPELINE_MAX_KEYS * 0.7)) break;
    }
    if (pipelineCache.size >= PIPELINE_MAX_KEYS) {
      const oldest = pipelineCache.keys().next().value;
      if (oldest !== undefined) pipelineCache.delete(oldest);
    }
  }
  const key = pipelineCacheKey(keyword, maxFinal);
  pipelineCache.set(key, { expiry: Date.now() + PIPELINE_TTL_MS, value });
}

// ── dedup ─────────────────────────────────────────────────────

/** 같은 YouTube 영상 + 정규화한 가수·제목(다른 영상이어도 동일 곡) 은 한 번만 */
export function dedupeMusicSearchResults(items: MusicSearchResultItem[]): MusicSearchResultItem[] {
  const seen = new Set<string>();
  const out: MusicSearchResultItem[] = [];
  for (const item of items) {
    const vid = item.video?.id;
    const trackK = `t:${normalizeTrackKey(item.artist, item.title)}`;
    if (vid) {
      if (seen.has(`id:${vid}`) || seen.has(trackK)) continue;
      seen.add(`id:${vid}`);
      seen.add(trackK);
      out.push(item);
      continue;
    }
    if (seen.has(trackK)) continue;
    seen.add(trackK);
    out.push(item);
  }
  return out;
}

// ── public API ────────────────────────────────────────────────

export async function runAiFirstMusicSearch(keyword: string): Promise<MusicSearchResultItem[]> {
  const maxFinal = 6;
  const cached = pipelineCacheGet(keyword, maxFinal);
  if (cached) return cached;

  const list = await runMoodTrackPipeline(keyword, { maxFinal });
  const result = dedupeMusicSearchResults(list);
  pipelineCacheSet(keyword, maxFinal, result);
  return result;
}

/** 라디오 슬롯당 1곡: 단일 트랙·고신뢰만 */
export async function runAiFirstMusicSearchOne(
  keyword: string
): Promise<MusicSearchResultItem | null> {
  const trimmed = keyword.trim();
  if (!trimmed) return null;

  const maxFinal = 1;
  const cached = pipelineCacheGet(trimmed, maxFinal);
  const first = cached ? cached[0] : undefined;
  if (first !== undefined) {
    return first.video
      ? first
      : { ...first, matchError: first.matchError ?? "이 곡에 맞는 단일 영상을 찾지 못했습니다." };
  }

  const list = await runMoodTrackPipeline(trimmed, { maxFinal });
  pipelineCacheSet(trimmed, maxFinal, list);
  const result = list[0];
  if (!result) return null;
  if (!result.video) {
    return {
      ...result,
      matchError: result.matchError ?? "이 곡에 맞는 단일 영상을 찾지 못했습니다.",
    };
  }
  return result;
}
