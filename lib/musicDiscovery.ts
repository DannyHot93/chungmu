// ======================================================
// 음악 검색 시의성 맥락 + 외부 후보(Spotify) 수집
//
// [차트/스트리밍·뉴스·검색 연동 시 일반적으로 필요한 것]
// - API 키·앱 등록: Spotify Developer(무료 티어) Client ID/Secret → 본 모듈에서 사용
// - 멜론/지니/벅스: 공식 공개 API가 제한적 → 제휴·스크래핑(약관)·유료 데이터
// - Apple Music: 개발자 프로그램 + MusicKit
// - Google Programmable Search: 검색엔진 ID + API 키 → 뉴스/웹 스니펫 후보
// - 뉴스 API: NewsAPI 등 → '2026 K-pop' 기사 제목에서 곡명 추출(추가 파이프라인)
// - 정렬: 발매일·차트 순위·인기도 점수를 합쳐 가중치(현재는 발매일 필터 + 최신순)
// ======================================================

export type DiscoveryContext = {
  calendarYear: number;
  keywordYears: number[];
  recencyIntent: boolean;
};

export type SeedCandidate = {
  artist: string;
  title: string;
  source: string;
  released?: string;
};

/** 키워드에서 연도·트렌드 의도 추출 */
export function buildDiscoveryContext(keyword: string): DiscoveryContext {
  const calendarYear = new Date().getFullYear();
  const years = new Set<number>();
  for (const m of keyword.matchAll(/\b(20[1-3]\d)\b/g)) {
    const y = Number.parseInt(m[1] ?? "0", 10);
    if (y >= 2000 && y <= calendarYear + 1) years.add(y);
  }
  const recencyIntent =
    /최신|올해|금년|신곡|핫|인기|트렌드|차트|떠오르|요즘|급상승|빌보드|멜론|스트리밍|화제|대세/i.test(
      keyword
    );
  return {
    calendarYear,
    keywordYears: [...years].sort((a, b) => b - a),
    recencyIntent,
  };
}

export function spotifyYearWindow(ctx: DiscoveryContext): { minYear: number; maxYear: number } {
  if (ctx.keywordYears.length > 0) {
    const target = Math.max(...ctx.keywordYears);
    return { minYear: target - 1, maxYear: target };
  }
  if (ctx.recencyIntent) {
    return { minYear: ctx.calendarYear - 1, maxYear: ctx.calendarYear };
  }
  return { minYear: 1990, maxYear: ctx.calendarYear + 1 };
}

function spotifySearchQuery(keyword: string): string {
  const k = keyword.trim().toLowerCase();
  if (/k-?pop|케이팝|한국\s*팝/.test(k)) return "k-pop";
  return keyword.trim().slice(0, 80);
}

function parseReleaseYear(date: string | undefined): number | null {
  if (!date) return null;
  const y = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

type SpotifyTokenCache = { token: string; expiresAt: number };
let spotifyTokenCache: SpotifyTokenCache | null = null;

async function getSpotifyAccessToken(): Promise<string | null> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;

  const now = Date.now();
  if (spotifyTokenCache && now < spotifyTokenCache.expiresAt - 60_000) {
    return spotifyTokenCache.token;
  }

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;

  const expiresInMs = (data.expires_in ?? 3600) * 1000;
  spotifyTokenCache = { token: data.access_token, expiresAt: now + expiresInMs };
  return data.access_token;
}

/**
 * Spotify 검색으로 후보 수집(한국 market).
 * 환경변수 미설정 시 빈 배열 — AI·프롬프트만으로 동작.
 */
export async function fetchSpotifySeedCandidates(
  keyword: string,
  ctx: DiscoveryContext
): Promise<SeedCandidate[]> {
  if (ctx.keywordYears.length === 0 && !ctx.recencyIntent) return [];

  const token = await getSpotifyAccessToken();
  if (!token) return [];

  const q = spotifySearchQuery(keyword);
  const { minYear, maxYear } = spotifyYearWindow(ctx);

  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("q", q);
  url.searchParams.set("type", "track");
  url.searchParams.set("market", "KR");
  url.searchParams.set("limit", "50");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return [];

  const json = (await res.json()) as {
    tracks?: { items?: SpotifyApiTrack[] };
  };

  const items = json.tracks?.items ?? [];

  const toCandidates = (filterYear: boolean): SeedCandidate[] => {
    const out: SeedCandidate[] = [];
    const seen = new Set<string>();
    for (const tr of items) {
      const albumDate = tr.album?.release_date;
      const ry = parseReleaseYear(albumDate);
      if (filterYear && ry !== null && (ry < minYear || ry > maxYear)) continue;

      const artist = tr.artists?.[0]?.name?.trim() ?? "";
      const title = tr.name?.trim() ?? "";
      if (!artist || !title) continue;

      const key = `${artist.toLowerCase()}\0${title.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        artist,
        title,
        source: "Spotify",
        released: albumDate,
      });
    }
    out.sort((a, b) => (b.released ?? "").localeCompare(a.released ?? ""));
    return out.slice(0, 24);
  };

  const strict = toCandidates(true);
  if (strict.length > 0) return strict;
  return toCandidates(false);
}

/** Spotify Web API track (필요 필드만) */
interface SpotifyApiTrack {
  name?: string;
  artists?: Array<{ name?: string }>;
  album?: { release_date?: string };
}
