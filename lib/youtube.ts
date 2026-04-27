// ======================================================
// YouTube Data API v3 호출 함수 (서버에서만 사용)
// 검색 결과 캐시 + 곡당 쿼리 수 축소로 quota 절감
// ======================================================

import type { YouTubeVideo } from "@/types";
import { cacheGet, cacheSet, searchListKey, trackMatchKey } from "./youtubeSearchCache";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

/** 곡 매칭 시 검색당 가져올 후보 수 (낮을수록 search 비용 동일, 후보 품질만 감소) */
const TRACK_SEARCH_MAX = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readSnippetField(
  snippet: Record<string, unknown> | undefined,
  field: string
): string {
  const value = snippet?.[field];
  return typeof value === "string" ? value : "";
}

function extractThumbnail(snippet: Record<string, unknown> | undefined): string {
  const thumbnails = isRecord(snippet?.thumbnails) ? snippet.thumbnails : undefined;
  const medium = isRecord(thumbnails?.medium) ? thumbnails.medium : undefined;
  const fallback = isRecord(thumbnails?.default) ? thumbnails.default : undefined;
  return readSnippetField(medium, "url") || readSnippetField(fallback, "url");
}

type SearchItem = {
  id: { videoId: string };
  snippet?: Record<string, unknown>;
};

function isSearchItem(item: unknown): item is SearchItem {
  return (
    isRecord(item) &&
    isRecord(item.id) &&
    typeof item.id.videoId === "string" &&
    (item.snippet === undefined || isRecord(item.snippet))
  );
}

async function fetchSearchYouTube(
  query: string,
  maxResults: number,
  apiKey: string
): Promise<YouTubeVideo[]> {
  const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("maxResults", String(maxResults));
  searchUrl.searchParams.set("videoCategoryId", "10"); // Music 카테고리
  searchUrl.searchParams.set("key", apiKey);

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    const err = await searchRes.json().catch(() => ({}));
    throw new Error(`YouTube 검색 오류: ${err?.error?.message ?? searchRes.statusText}`);
  }

  const searchData: unknown = await searchRes.json();
  const items = isRecord(searchData) && Array.isArray(searchData.items) ? searchData.items : [];

  if (items.length === 0) return [];

  const videoIds = items
    .map((item) => {
      const id = isRecord(item) && isRecord(item.id) ? item.id.videoId : undefined;
      return typeof id === "string" ? id : "";
    })
    .filter(Boolean)
    .join(",");

  const videoUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
  videoUrl.searchParams.set("part", "contentDetails");
  videoUrl.searchParams.set("id", videoIds);
  videoUrl.searchParams.set("key", apiKey);

  const videoRes = await fetch(videoUrl.toString());
  if (!videoRes.ok) {
    const err = await videoRes.json().catch(() => ({}));
    throw new Error(`YouTube 상세 조회 오류: ${err?.error?.message ?? videoRes.statusText}`);
  }
  const videoData: unknown = await videoRes.json();
  const detailItems =
    isRecord(videoData) && Array.isArray(videoData.items) ? videoData.items : [];

  const durationMap: Record<string, string> = {};
  for (const v of detailItems) {
    if (!isRecord(v)) continue;
    const id = typeof v.id === "string" ? v.id : "";
    const contentDetails = isRecord(v.contentDetails) ? v.contentDetails : undefined;
    if (!id) continue;
    durationMap[id] =
      typeof contentDetails?.duration === "string" ? contentDetails.duration : "PT0S";
  }

  return items
    .filter((item): item is SearchItem => isSearchItem(item))
    .map((item): YouTubeVideo => {
      const id = item.id.videoId;
      const snippet = item.snippet;
      return {
        id,
        title: readSnippetField(snippet, "title"),
        channelTitle: readSnippetField(snippet, "channelTitle"),
        thumbnail: extractThumbnail(snippet),
        description: readSnippetField(snippet, "description").slice(0, 120),
        duration: durationMap[id] ?? "PT0S",
        publishedAt: readSnippetField(snippet, "publishedAt"),
      };
    });
}

/**
 * YouTube 검색 (동일 쿼리·maxResults는 1시간 캐시로 API 생략)
 * query / maxResults: 기본 5 (quota: search.list + videos.list 1회)
 */
export async function searchYouTube(
  query: string,
  maxResults = 5
): Promise<YouTubeVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY 환경변수가 설정되지 않았습니다.");

  const key = searchListKey(query, maxResults);
  const hit = cacheGet<YouTubeVideo[]>(key);
  if (hit) return hit;

  const results = await fetchSearchYouTube(query, maxResults, apiKey);
  cacheSet(key, results);
  return results;
}

/** 동일 videoId 중복 제거 (순서 유지) */
export function dedupeYouTubeVideosById(videos: YouTubeVideo[]): YouTubeVideo[] {
  const seen = new Set<string>();
  const out: YouTubeVideo[] = [];
  for (const v of videos) {
    if (!v.id || seen.has(v.id)) continue;
    seen.add(v.id);
    out.push(v);
  }
  return out;
}

/** ISO 8601 duration (PT3M45S) → 초 */
export function isoDurationToSeconds(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] ?? "0", 10);
  const m = parseInt(match[2] ?? "0", 10);
  const s = parseInt(match[3] ?? "0", 10);
  return h * 3600 + m * 60 + s;
}

/** 플레이리스트·모음·장시간 라이브 등 단일 곡 검색에 부적합한 제목 */
export function looksLikePlaylistTitle(text: string): boolean {
  const t = text.toLowerCase();
  if (/\bplaylist\b/i.test(t)) return true;
  if (/플레이리스트|모음|모음집|compilation|full album|full\s*album/i.test(t))
    return true;
  if (/\b(top\s*\d+|best\s*\d+|hits\s*\d+)/i.test(t)) return true;
  if (/\d+\s*(시간|hours?)\s*(loop|playlist|mix)?/i.test(t)) return true;
  if (/\bmix\b.*\d+\s*(hour|min|시간)/i.test(t)) return true;
  return false;
}

/** search snippet 제목·설명: 플리/믹스/연속재생·모음 등 단일곡 후보에서 제외 */
export function looksLikePlaylistOrCompilationSnippet(
  title: string,
  description: string
): boolean {
  if (looksLikePlaylistTitle(title)) return true;
  const combined = `${title}\n${description}`;
  const c = combined.toLowerCase();
  if (/\bplaylist\b/i.test(c)) return true;
  if (/\b(mix|compilation|full album)\b/i.test(c)) return true;
  if (/모음|플레이리스트|1시간|연속재생|연속 play/i.test(c)) return true;
  if (/\bcontinuous\b|hours?\s*of|loop/i.test(c)) return true;
  if (/\d{1,2}:\d{2}:\d{2}.*(playlist|mix|album)/i.test(c)) return true;
  if (description.length > 400 && /subscribe|tracklist|00:00.*00:/i.test(c)) return true;
  return false;
}

type SearchSnippetOnly = {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  thumbnail: string;
  publishedAt: string;
};

const MOOD_SEARCH_CACHE_PREFIX = "moodQ:";

/**
 * search.list만 수행 (type=video, Music). duration 없음.
 * 쿼리당 100 quota — mood 파이프라인에서 소량만 호출.
 */
export async function searchListVideosOnly(
  query: string,
  maxResults: number
): Promise<SearchSnippetOnly[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY 환경변수가 설정되지 않았습니다.");

  const key = searchListKey(`${MOOD_SEARCH_CACHE_PREFIX}${query}`, maxResults);
  const hit = cacheGet<SearchSnippetOnly[]>(key);
  if (hit) return hit;

  const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("maxResults", String(maxResults));
  searchUrl.searchParams.set("videoCategoryId", "10");
  searchUrl.searchParams.set("key", apiKey);

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    const err = await searchRes.json().catch(() => ({}));
    throw new Error(`YouTube 검색 오류: ${err?.error?.message ?? searchRes.statusText}`);
  }

  const searchData: unknown = await searchRes.json();
  const items = isRecord(searchData) && Array.isArray(searchData.items) ? searchData.items : [];

  const out: SearchSnippetOnly[] = [];
  for (const item of items) {
    if (!isSearchItem(item)) continue;
    const snippet = item.snippet;
    out.push({
      id: item.id.videoId,
      title: readSnippetField(snippet, "title"),
      description: readSnippetField(snippet, "description"),
      channelTitle: readSnippetField(snippet, "channelTitle"),
      thumbnail: extractThumbnail(snippet),
      publishedAt: readSnippetField(snippet, "publishedAt"),
    });
  }
  cacheSet(key, out);
  return out;
}

/**
 * videos.list part=snippet,contentDetails,status — 배치 1회(quota 1)로 duration·embeddable·본문
 */
export async function fetchYouTubeVideosFullByIds(
  videoIds: string[]
): Promise<Map<string, YouTubeVideo>> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY 환경변수가 설정되지 않았습니다.");
  const unique = [...new Set(videoIds.filter((id) => id.length === 11))];
  if (unique.length === 0) return new Map();

  const map = new Map<string, YouTubeVideo>();
  const chunkSize = 50;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const videoUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
    videoUrl.searchParams.set("part", "snippet,contentDetails,status");
    videoUrl.searchParams.set("id", chunk.join(","));
    videoUrl.searchParams.set("key", apiKey);

    const videoRes = await fetch(videoUrl.toString());
    if (!videoRes.ok) {
      const err = await videoRes.json().catch(() => ({}));
      throw new Error(
        `YouTube 상세 조회 오류: ${err?.error?.message ?? videoRes.statusText}`
      );
    }
    const videoData: unknown = await videoRes.json();
    const detailItems =
      isRecord(videoData) && Array.isArray(videoData.items) ? videoData.items : [];

    for (const v of detailItems) {
      if (!isRecord(v)) continue;
      const id = typeof v.id === "string" ? v.id : "";
      if (id.length !== 11) continue;
      const snippet = isRecord(v.snippet) ? v.snippet : undefined;
      const contentDetails = isRecord(v.contentDetails) ? v.contentDetails : undefined;
      const status = isRecord(v.status) ? v.status : undefined;
      const embeddable = typeof status?.embeddable === "boolean" ? status.embeddable : true;

      const duration =
        typeof contentDetails?.duration === "string" ? contentDetails.duration : "PT0S";

      map.set(id, {
        id,
        title: readSnippetField(snippet, "title"),
        channelTitle: readSnippetField(snippet, "channelTitle"),
        thumbnail: extractThumbnail(snippet as Record<string, unknown>),
        description: readSnippetField(snippet, "description").slice(0, 2000),
        duration,
        publishedAt: readSnippetField(snippet, "publishedAt"),
        embeddable,
      });
    }
  }
  return map;
}

/**
 * 아티스트+곡 제목으로 단일 트랙 영상 검색
 * — 쿼리는 최대 2번만 (이전 4번 대비 search.list 절반)
 * — 동일 아티스트·제목은 캐시로 재검색 시 API 0회
 */
export async function searchYouTubeForTrack(
  artist: string,
  title: string
): Promise<YouTubeVideo | null> {
  const tk = trackMatchKey(artist, title);
  const cached = cacheGet<{ video: YouTubeVideo | null }>(tk);
  if (cached !== undefined) return cached.video;

  const queries = [`${artist} ${title} official`, `${artist} ${title}`];

  const seen = new Set<string>();

  for (const q of queries) {
    const list = await searchYouTube(q, TRACK_SEARCH_MAX);
    for (const v of list) {
      if (seen.has(v.id)) continue;
      if (looksLikePlaylistTitle(v.title)) continue;
      const sec = isoDurationToSeconds(v.duration);
      if (sec > 900) continue;
      seen.add(v.id);
      cacheSet(tk, { video: v });
      return v;
    }
  }

  cacheSet(tk, { video: null });
  return null;
}

// ISO 8601 duration (PT3M45S) → "3:45" 형식으로 변환
export function parseDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "0:00";
  const h = parseInt(match[1] ?? "0");
  const m = parseInt(match[2] ?? "0");
  const s = parseInt(match[3] ?? "0");
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 재생 타임라인용 HH:MM:SS */
export function formatSecondsClock(total: number): string {
  const t = Math.max(0, Math.floor(total));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 요약 바용 한글 길이 (예: 59분 30초) */
export function formatDurationKorean(total: number): string {
  const t = Math.max(0, Math.floor(total));
  if (t === 0) return "0분 0초";
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h}시간 ${m}분 ${s}초`;
  return `${m}분 ${s}초`;
}
