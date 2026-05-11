import type { MusicIntent } from "./musicIntent";

export type CandidateSource = "itunes" | "lastfm" | "musicbrainz" | "local";

export type CandidateTrack = {
  artist: string;
  title: string;
  album?: string;
  releaseDate?: string;
  genre?: string;
  durationMs?: number;
  source: CandidateSource;
  sourceScore: number;
  tags?: string[];
  verifiedOfficial?: boolean;
};

type CacheEntry<T> = { expiry: number; value: T };

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | undefined {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (!hit) return undefined;
  if (Date.now() > hit.expiry) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet<T>(key: string, value: T): T {
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiry <= now) cache.delete(k);
      if (cache.size < 350) break;
    }
  }
  cache.set(key, { expiry: Date.now() + CACHE_TTL_MS, value });
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(items: string[], max = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const v = item.trim().replace(/\s+/g, " ");
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeKey(artist: string, title: string): string {
  return `${artist} ${title}`
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9가-힣]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function yearFromDate(date: string | undefined): number | null {
  if (!date) return null;
  const m = date.match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

function recentScore(candidate: CandidateTrack, intent: MusicIntent): number {
  const year = yearFromDate(candidate.releaseDate);
  if (!year) return 0;
  if (intent.targetYears.includes(year)) return 220;
  const nowYear = new Date().getFullYear();
  if (intent.recencyIntent) {
    if (year >= nowYear) return 180;
    if (year >= nowYear - 1) return 120;
    return Math.max(0, 60 - (nowYear - year) * 12);
  }
  return year >= nowYear - 2 ? 25 : 0;
}

function intentText(intent: MusicIntent): string {
  return [
    ...intent.mood,
    ...intent.scene,
    ...intent.genreHints,
    ...intent.searchTags,
    intent.energy,
    intent.tempo,
    intent.useCase,
  ]
    .join(" ")
    .toLowerCase();
}

function moodScore(candidate: CandidateTrack, intent: MusicIntent): number {
  const haystack = [candidate.genre, ...(candidate.tags ?? [])].join(" ").toLowerCase();
  if (!haystack.trim()) return 0;
  let score = 0;
  for (const tag of uniqueStrings([...intent.genreHints, ...intent.searchTags], 16)) {
    const t = tag.toLowerCase();
    if (t && haystack.includes(t)) score += 45;
  }
  const it = intentText(intent);
  if (/happy|upbeat|funk|dance|feel good/.test(it) && /pop|dance|funk|k-pop|kpop/.test(haystack)) {
    score += 40;
  }
  if (/chill|sad|ballad|indie|rnb|r&b/.test(it) && /ballad|indie|r.?b|soul|pop/.test(haystack)) {
    score += 40;
  }
  if (/tense|cinematic|electronic|dark/.test(it) && /electronic|soundtrack|ambient|score/.test(haystack)) {
    score += 35;
  }
  return score;
}

function avoidPenalty(candidate: CandidateTrack, intent: MusicIntent): number {
  const haystack = `${candidate.artist} ${candidate.title} ${candidate.album ?? ""} ${candidate.genre ?? ""} ${
    candidate.tags?.join(" ") ?? ""
  }`.toLowerCase();
  let penalty = 0;
  for (const avoid of intent.avoid) {
    const a = avoid.toLowerCase();
    if (a && haystack.includes(a)) penalty += 120;
  }
  if (/karaoke|cover|tribute|remix|sped up|slowed|nightcore|instrumental version/.test(haystack)) {
    penalty += 120;
  }
  return penalty;
}

function scoreCandidate(candidate: CandidateTrack, intent: MusicIntent): number {
  const koreaScore =
    intent.koreanPreference && (candidate.source === "itunes" || /korean|k-pop|kpop/i.test(candidate.genre ?? ""))
      ? 180
      : 0;
  const officialScore = candidate.verifiedOfficial ? 140 : 0;
  const durationScore =
    candidate.durationMs && candidate.durationMs >= 25_000 && candidate.durationMs <= 900_000 ? 35 : 0;
  return (
    candidate.sourceScore +
    koreaScore +
    officialScore +
    durationScore +
    recentScore(candidate, intent) +
    moodScore(candidate, intent) -
    avoidPenalty(candidate, intent)
  );
}

function buildItunesQueries(input: string, intent: MusicIntent): string[] {
  const base = input.length > 55 ? input.slice(0, 55) : input;
  const tags = uniqueStrings([...intent.searchTags, ...intent.genreHints], 5);
  const queries = [
    `${base} 한국 노래`,
    `k-pop ${tags.slice(0, 3).join(" ")}`,
    `${tags.slice(0, 4).join(" ")} Korean`,
  ];
  if (intent.recencyIntent) {
    queries.unshift(`latest k-pop ${tags.slice(0, 2).join(" ")}`);
  }
  return uniqueStrings(queries, 3);
}

function localSituationSeeds(intent: MusicIntent): CandidateTrack[] {
  const text = intentText(intent);
  const seeds: CandidateTrack[] = [];
  if (/comedy|happy|upbeat|funky|feel good|밝|유쾌|코미디|예능/.test(text)) {
    seeds.push(
      {
        artist: "노라조",
        title: "슈퍼맨",
        source: "local",
        sourceScore: 360,
        tags: ["k-pop", "comedy", "upbeat"],
        verifiedOfficial: true,
      },
      {
        artist: "오렌지캬라멜",
        title: "까탈레나",
        source: "local",
        sourceScore: 340,
        tags: ["k-pop", "comedy", "dance pop"],
        verifiedOfficial: true,
      },
      {
        artist: "Red Velvet",
        title: "빨간 맛",
        source: "local",
        sourceScore: 320,
        tags: ["k-pop", "upbeat", "dance pop"],
        verifiedOfficial: true,
      }
    );
  }
  if (/chill|sad|ballad|indie|감성|아련|퇴근|새벽|비/.test(text)) {
    seeds.push(
      {
        artist: "뎁트",
        title: "Winter Blossom",
        source: "local",
        sourceScore: 310,
        tags: ["korean", "chill", "r&b"],
        verifiedOfficial: true,
      },
      {
        artist: "잔나비",
        title: "주저하는 연인들을 위해",
        source: "local",
        sourceScore: 300,
        tags: ["korean", "indie", "ballad"],
        verifiedOfficial: true,
      }
    );
  }
  return seeds;
}

async function fetchJson(url: string, headers?: HeadersInit): Promise<unknown> {
  const signal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(6_000)
      : undefined;
  const res = await fetch(url, { headers, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function searchItunesKr(input: string, intent: MusicIntent): Promise<CandidateTrack[]> {
  const queries = buildItunesQueries(input, intent);
  const all: CandidateTrack[] = [];
  await Promise.all(
    queries.map(async (query, queryIndex) => {
      const key = `itunes:${query.toLowerCase()}`;
      const cached = cacheGet<CandidateTrack[]>(key);
      if (cached) {
        all.push(...cached);
        return;
      }
      const url = new URL("https://itunes.apple.com/search");
      url.searchParams.set("term", query);
      url.searchParams.set("country", "KR");
      url.searchParams.set("media", "music");
      url.searchParams.set("entity", "song");
      url.searchParams.set("limit", "20");
      url.searchParams.set("explicit", "No");

      const data = await fetchJson(url.toString());
      const results = isRecord(data) && Array.isArray(data.results) ? data.results : [];
      const mapped = results
        .filter(isRecord)
        .map((item, index): CandidateTrack | null => {
          const artist = text(item.artistName);
          const title = text(item.trackName);
          if (!artist || !title) return null;
          return {
            artist,
            title,
            album: text(item.collectionName) || undefined,
            releaseDate: text(item.releaseDate) || undefined,
            genre: text(item.primaryGenreName) || undefined,
            durationMs: typeof item.trackTimeMillis === "number" ? item.trackTimeMillis : undefined,
            source: "itunes",
            sourceScore: 260 - queryIndex * 25 - index * 3,
            tags: uniqueStrings([text(item.primaryGenreName)]),
          };
        })
        .filter((item): item is CandidateTrack => item !== null);
      all.push(...cacheSet(key, mapped));
    })
  ).catch(() => undefined);
  return all;
}

function lastfmApiKey(): string {
  return process.env.LASTFM_API_KEY?.trim() ?? "";
}

export async function searchLastfmByIntent(intent: MusicIntent): Promise<CandidateTrack[]> {
  const apiKey = lastfmApiKey();
  if (!apiKey) return [];
  const tags = uniqueStrings([...intent.searchTags, ...intent.genreHints], 4);
  const all: CandidateTrack[] = [];

  await Promise.all(
    tags.map(async (tag, tagIndex) => {
      const key = `lastfm:tag:${tag.toLowerCase()}`;
      const cached = cacheGet<CandidateTrack[]>(key);
      if (cached) {
        all.push(...cached);
        return;
      }
      const url = new URL("https://ws.audioscrobbler.com/2.0/");
      url.searchParams.set("method", "tag.gettoptracks");
      url.searchParams.set("tag", tag);
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "15");
      const data = await fetchJson(url.toString());
      const rawTracks = isRecord(data) && isRecord(data.tracks) ? data.tracks.track : [];
      const tracks = Array.isArray(rawTracks) ? rawTracks : rawTracks ? [rawTracks] : [];
      const mapped = tracks
        .filter(isRecord)
        .map((track, index): CandidateTrack | null => {
          const title = text(track.name);
          const artistRaw = isRecord(track.artist) ? track.artist.name : track.artist;
          const artist = text(artistRaw);
          if (!artist || !title) return null;
          const listeners = Number(track.listeners);
          const popularity = Number.isFinite(listeners) ? Math.min(100, Math.log10(listeners + 1) * 18) : 0;
          return {
            artist,
            title,
            source: "lastfm",
            sourceScore: 210 + popularity - tagIndex * 20 - index * 2,
            tags: [tag],
          };
        })
        .filter((item): item is CandidateTrack => item !== null);
      all.push(...cacheSet(key, mapped));
    })
  ).catch(() => undefined);

  return all;
}

function musicBrainzUserAgent(): string {
  return (
    process.env.MUSICBRAINZ_USER_AGENT?.trim() ||
    "ChungMuMusicSearch/0.1.0 ( local-dev@example.com )"
  );
}

async function verifyOneWithMusicBrainz(candidate: CandidateTrack): Promise<CandidateTrack> {
  const key = `mb:${normalizeKey(candidate.artist, candidate.title)}`;
  const cached = cacheGet<Partial<CandidateTrack>>(key);
  if (cached) return { ...candidate, ...cached };

  const query = `recording:"${candidate.title.replace(/"/g, "")}" AND artist:"${candidate.artist.replace(/"/g, "")}"`;
  const url = new URL("https://musicbrainz.org/ws/2/recording/");
  url.searchParams.set("query", query);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", "3");
  url.searchParams.set("inc", "releases");

  const data = await fetchJson(url.toString(), { "User-Agent": musicBrainzUserAgent() });
  const recordings = isRecord(data) && Array.isArray(data.recordings) ? data.recordings : [];
  const first = recordings.find(isRecord);
  if (!first) {
    cacheSet(key, {});
    return candidate;
  }

  const score = Number(first.score);
  const releases = Array.isArray(first.releases) ? first.releases.filter(isRecord) : [];
  const officialRelease = releases.some((r) => text(r.status).toLowerCase() === "official");
  const releaseDate =
    text(first["first-release-date"]) ||
    releases.map((r) => text(r.date)).find(Boolean) ||
    candidate.releaseDate;
  const update: Partial<CandidateTrack> = {
    releaseDate,
    verifiedOfficial: officialRelease || (Number.isFinite(score) && score >= 90),
  };
  cacheSet(key, update);
  return { ...candidate, ...update };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyTopWithMusicBrainz(candidates: CandidateTrack[]): Promise<CandidateTrack[]> {
  const top = candidates.slice(0, 5);
  const verified: CandidateTrack[] = [];
  for (const candidate of top) {
    try {
      verified.push(await verifyOneWithMusicBrainz(candidate));
      await sleep(1_050);
    } catch {
      verified.push(candidate);
    }
  }
  return [...verified, ...candidates.slice(top.length)];
}

export async function collectFreeDbCandidates(
  input: string,
  intent: MusicIntent
): Promise<CandidateTrack[]> {
  const [itunes, lastfm] = await Promise.all([
    searchItunesKr(input, intent),
    searchLastfmByIntent(intent),
  ]);
  const merged = new Map<string, CandidateTrack>();
  for (const candidate of [...localSituationSeeds(intent), ...itunes, ...lastfm]) {
    const key = normalizeKey(candidate.artist, candidate.title);
    if (!key) continue;
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, candidate);
      continue;
    }
    merged.set(key, {
      ...prev,
      ...candidate,
      source: prev.source === "itunes" ? prev.source : candidate.source,
      sourceScore: Math.max(prev.sourceScore, candidate.sourceScore) + 45,
      tags: uniqueStrings([...(prev.tags ?? []), ...(candidate.tags ?? [])], 10),
      releaseDate: prev.releaseDate ?? candidate.releaseDate,
      genre: prev.genre ?? candidate.genre,
      durationMs: prev.durationMs ?? candidate.durationMs,
    });
  }

  const ranked = [...merged.values()]
    .map((candidate) => ({
      candidate,
      rank: scoreCandidate(candidate, intent),
    }))
    .sort((a, b) => b.rank - a.rank)
    .map(({ candidate, rank }) => ({ ...candidate, sourceScore: rank }));

  const verified = await verifyTopWithMusicBrainz(ranked);
  return verified
    .map((candidate) => ({ candidate, rank: scoreCandidate(candidate, intent) }))
    .sort((a, b) => b.rank - a.rank)
    .map(({ candidate, rank }) => ({ ...candidate, sourceScore: rank }))
    .slice(0, 12);
}
