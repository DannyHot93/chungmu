// ======================================================
// 분위기/용도 키워드 → 단일곡 YouTube 후보만
// Gemini 키워드 확장 → Tavily → (최소) YouTube search.list → videos.list
// → Gemini 단일/플리 분류
// ======================================================

import { runGeminiStructuredJson } from "./geminiLlm";
import { tavilySearch } from "./tavily";
import type { MusicSearchResultItem, YouTubeVideo } from "@/types";
import { normalizeTrackKey, yearFromPublishedAt } from "./trackKey";
import {
  fetchYouTubeVideosFullByIds,
  isoDurationToSeconds,
  looksLikePlaylistOrCompilationSnippet,
  searchListVideosOnly,
} from "./youtube";

const MAX_SEARCH_LIST_CALLS = 4;
const MAX_VIDEO_IDS = 20;
const SINGLE_MAX_SEC = 900;
const SINGLE_MIN_SEC = 25;
const MIN_CONFIDENCE = 0.55;
const DEFAULT_MULTI_FINAL = 6;
/** 업로드 연도 기준: 이내면 '최신' 풀(최신·과거 섞기용) */
const RECENT_UPLOAD_YEARS = 3;

type RawCandidate = {
  artist: string;
  title: string;
  youtubeUrl?: string;
};

type ClassRow = {
  videoId: string;
  label: "single" | "playlist" | "uncertain";
  reason: string;
  confidenceScore: number;
  moodTags: string[];
  displayTitle: string;
  displayArtist: string;
  /** 음원으로 정식 발매된 단일 트랙(앨범/싱글/OST 음원 등)에 해당하는지 */
  isOfficialRelease: boolean;
  /** 한국에서 활동·발매한 가수/작곡가의 국내 곡(또는 국내 방송/영화 OST)인지 */
  koreanDomestic: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function extractYoutubeVideoIdsFromText(text: string): string[] {
  const ids = new Set<string>();
  const ra = /[?&]v=([a-zA-Z0-9_-]{11})/g;
  const rb = /youtu\.be\/([a-zA-Z0-9_-]{11})/g;
  for (const re of [ra, rb]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[1]?.length === 11) ids.add(m[1]);
    }
  }
  return [...ids];
}

function toYoutubeUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** 1) 한국어 입력 → 키워드 5~10 (국내 정식 음원·한국 가수/OST 쪽 검색에 유리하게) */
async function expandKoreanToKeywords(korean: string): Promise<string[]> {
  const system = `당신은 한국 방송 음악 담당 보조 AI입니다. 사용자의 한국어 한 줄을 **웹·Tavily·YouTube 검색용 키워드 5~10개**로만 확장합니다.
규칙:
- **한국 국내에서 정식 발매·유통되는 음원**(한국 가수, 국내 OST, 국내 방송/영화 음악)을 찾는 데 유리하도록, 한국어 위주 + 필요 시 짧은 영어를 섞으세요(분위기·용도·장르·BGM·뉴스·오프닝 등).
- AI 커버·무료 BGM 사이트·해외 stock만의 트랙을 쫓는 표현은 피하세요.
- JSON만: { "keywords": ["..."] }`;

  try {
    const p = await runGeminiStructuredJson(
      system,
      `다음 요청: ${korean.trim()}`,
      0.45,
      (x) => Array.isArray(x.keywords) && (x.keywords as unknown[]).length >= 5
    );
    const kws = (p.keywords as unknown[])
      .map((s) => String(s).trim())
      .filter((s) => s.length > 0);
    if (kws.length >= 5) {
      return kws.slice(0, 10);
    }
  } catch {
    /* 폴백 */
  }
  return [
    korean.trim(),
    `한국 ${korean} BGM 음원`,
    `국내 OST ${korean}`,
    `${korean} 정식 발매`,
    "한국 가수 single official",
  ];
}

function buildTavilyQueries(keywords: string[]): string[] {
  const a = keywords.slice(0, 4).join(" ");
  const kSuffix = " 한국 음원 정식 발매 국내 가수";
  if (keywords.length <= 4) {
    return [`${a} youtube official audio ${kSuffix}`];
  }
  const b = keywords.slice(4, 8).join(" ");
  if (b.trim()) {
    return [
      `${a} 한국 OST BGM official`,
      `${b} 국내 음악 single youtube`,
    ];
  }
  return [`${a} 한국 음악 official`];
}

/** Tavily 1~2회 */
async function runTavilyToBlob(keywords: string[]): Promise<string> {
  const tavilyQueries = buildTavilyQueries(keywords);
  const chunks: string[] = [];
  for (const tq of tavilyQueries) {
    const items = await tavilySearch(tq, 8);
    for (const it of items) {
      chunks.push(`[${it.title}]\nURL:${it.url}\n${it.content}`.slice(0, 3500));
    }
  }
  return chunks.join("\n\n---\n\n").slice(0, 12000);
}

/** 3) 웹 본문에서 곡+선택 URL 후보 */
async function parseCandidatesFromWeb(
  userInput: string,
  keywords: string[],
  webBlob: string
): Promise<RawCandidate[]> {
  if (!webBlob.trim()) return [];

  const system = `다음은 웹·커뮤니티·블로그에서 가져온 음악 추천 텍스트입니다.
뽑을 곡:
- **정식 음원으로 발매된** 단일 트랙(싱글·앨범 수록·공식 OST·공식 digital release)만. 팬 제작, 무료 BGM 냉장고 사이트 전용, AI 생성 음원은 제외.
- **한국에서 발매/유통되거나**, 한국 가수·한국 OST(국내 드라마/영화/방송)로 인지되는 곡을 **최우선**으로(가능한 한 앞쪽에).
- 플리·앨범전체·TOP100 믹스·1시간 믹스는 제외.
최대 12개. JSON만: { "candidates": [ { "artist", "title", "youtubeUrl"?: "https://... 본문에 있을 때만" } ] }`;
  const user = `사용자_입력: ${userInput}
키워드: ${keywords.join(" | ")}
[웹_결과]
${webBlob}`;

  const p = await runGeminiStructuredJson(
    system,
    user,
    0.4,
    (x) => Array.isArray(x.candidates) && (x.candidates as unknown[]).length > 0
  );

  const raw = p.candidates as unknown[];
  const out: RawCandidate[] = [];
  for (const c of raw) {
    if (!isRecord(c)) continue;
    const artist = String(c.artist ?? "").trim();
    const title = String(c.title ?? "").trim();
    if (!artist || !title) continue;
    const y = c.youtubeUrl != null ? String(c.youtubeUrl).trim() : "";
    out.push({
      artist,
      title,
      youtubeUrl: y.startsWith("http") ? y : undefined,
    });
  }
  return out;
}

/** search.list 예산으로 id 보강 */
async function collectIdsWithNarrowSearch(
  userInput: string,
  candidates: RawCandidate[],
  webText: string
): Promise<string[]> {
  const fromUrl = new Set<string>();

  for (const id of extractYoutubeVideoIdsFromText(webText)) {
    fromUrl.add(id);
  }
  for (const c of candidates) {
    if (c.youtubeUrl) {
      for (const id of extractYoutubeVideoIdsFromText(c.youtubeUrl)) {
        fromUrl.add(id);
      }
    }
  }

  const searchListCalls = { n: 0 };
  const orderedNoUrl = candidates.filter((c) => !c.youtubeUrl);

  for (const c of orderedNoUrl) {
    if (searchListCalls.n >= MAX_SEARCH_LIST_CALLS) break;
    if (fromUrl.size >= MAX_VIDEO_IDS) break;
    const q = `${c.artist} ${c.title} official 음원`.trim();
    if (q.length < 4) continue;
    const rows = await searchListVideosOnly(q, 3);
    searchListCalls.n += 1;
    for (const row of rows) {
      if (row.id) fromUrl.add(row.id);
    }
  }

  if (fromUrl.size === 0 && searchListCalls.n < MAX_SEARCH_LIST_CALLS) {
    const q = userInput.length > 60 ? userInput.slice(0, 60) : userInput;
    const rows = await searchListVideosOnly(
      `한국 ${q} BGM OST official 음원 -playlist -1hour`,
      5
    );
    searchListCalls.n += 1;
    for (const row of rows) {
      if (row.id) fromUrl.add(row.id);
    }
  }

  return [...fromUrl].slice(0, MAX_VIDEO_IDS);
}

function filterPreClassification(videos: Map<string, YouTubeVideo>): YouTubeVideo[] {
  const out: YouTubeVideo[] = [];
  for (const v of videos.values()) {
    if (v.embeddable === false) continue;
    const sec = isoDurationToSeconds(v.duration);
    if (sec < SINGLE_MIN_SEC || sec > SINGLE_MAX_SEC) continue;
    if (looksLikePlaylistOrCompilationSnippet(v.title, v.description)) continue;
    out.push(v);
  }
  return out;
}

/** 6) 단일/플리/불확실 분류 */
async function classifySingleVsPlaylist(
  userInput: string,
  videos: YouTubeVideo[]
): Promise<Map<string, ClassRow>> {
  if (videos.length === 0) return new Map();

  const payload = videos.map((v) => ({
    videoId: v.id,
    title: v.title,
    description: v.description.slice(0, 800),
    channelTitle: v.channelTitle,
    duration: v.duration,
  }));

  const system = `당신은 **한국 방송국** 음악 감독 보조입니다. 각 YouTube video에 대해 판정합니다.

1) **label** = single | playlist | uncertain
- single: 한 곡 MV, **Official/공식/음원(Topic 등)으로 올라온 단일 트랙**, 통상 25초~15분
- playlist: 플리, mix, 1 hour, fan edit 전곡, compilation, full album, 연속재생, 모음
- uncertain: 애매함

2) **isOfficialRelease** = true | false
- true: **상업·공식 음원으로 발매/유통된** 원곡(스밍·CD·OST 음원). 공식 채널/MV/Audio가 명확한 경우
- false: AI 생성, fan cover가 원본, 무료 SFX 믹스, 저작권free 사이트 전용, 콘서트 풀라이브만 등 **정식 발매곡이 아닌** 경우

3) **koreanDomestic** = true | false
- true: **한국에서 활동하는 가수/작곡가의 곡**이거나, **국내 방송/영화/드라마/뉴스 OST**로 널리 쓰이는 **국내권(한국) 정식 음원**
- false: 위에 해당하기 어려운 해외 전용, 해외 뉴스 패키지, 한국과 무관한 곡
- (사용자가 요구한 "국내곡 위주"를 판정할 때, 한글 제목/가수명, 국내 방송 톤, 국산 OST 여부를 근거로 씀)

4) **displayTitle**, **displayArtist** = 표시용 **정곡명·가수(한국어 위주)**, 아는 대로
5) **moodTags** = 2~4개, 한국어·짧게

JSON만: { "items": [ { "videoId", "label", "isOfficialRelease", "koreanDomestic", "reason", "confidenceScore", "moodTags", "displayTitle", "displayArtist" } ] }`;

  const p = await runGeminiStructuredJson(
    system,
    `사용자_요청: ${userInput}\n후보: ${JSON.stringify(payload)}`,
    0.35,
    (x) => Array.isArray(x.items) && (x.items as unknown[]).length > 0
  );

  const items = p.items as unknown[];
  const map = new Map<string, ClassRow>();
  for (const it of items) {
    if (!isRecord(it)) continue;
    const videoId = String(it.videoId ?? "");
    if (videoId.length !== 11) continue;
    const labelRaw = String(it.label ?? "uncertain").toLowerCase();
    const label: ClassRow["label"] =
      labelRaw === "single" || labelRaw === "playlist" || labelRaw === "uncertain"
        ? labelRaw
        : "uncertain";
    const confidenceScore = Math.min(1, Math.max(0, Number(it.confidenceScore)));
    const moodRaw = it.moodTags;
    const moodTags = Array.isArray(moodRaw)
      ? (moodRaw as unknown[]).map((m) => String(m).trim()).filter(Boolean)
      : [];
    const isOfficialRelease = it.isOfficialRelease === true;
    const koreanDomestic = it.koreanDomestic === true;
    map.set(videoId, {
      videoId,
      label,
      reason: String(it.reason ?? "").trim(),
      confidenceScore: Number.isFinite(confidenceScore) ? confidenceScore : 0.5,
      moodTags,
      displayTitle: String(it.displayTitle ?? "").trim(),
      displayArtist: String(it.displayArtist ?? "").trim(),
      isOfficialRelease,
      koreanDomestic,
    });
  }
  return map;
}

type Scored = { video: YouTubeVideo; row: ClassRow; rank: number };

/** videoId + 정규화 가수·제목(다른 영상 중복) 제거, rank 높은 순이 이미 앞 */
function dedupeScoredChampions(scored: Scored[]): Scored[] {
  const seenIds = new Set<string>();
  const seenTrackKeys = new Set<string>();
  const out: Scored[] = [];
  for (const s of scored) {
    if (seenIds.has(s.video.id)) continue;
    const artist = s.row.displayArtist || s.video.channelTitle;
    const title = s.row.displayTitle || s.video.title;
    const tKey = normalizeTrackKey(artist, title);
    if (seenTrackKeys.has(tKey)) continue;
    seenIds.add(s.video.id);
    seenTrackKeys.add(tKey);
    out.push(s);
  }
  return out;
}

/** 업로드 시점(최근 N년 vs 그 전) 풀을 섞어 골고루 노출 */
function interleaveRecentAndLegacy(items: Scored[], maxFinal: number): Scored[] {
  if (items.length === 0) return [];
  const nowY = new Date().getFullYear();
  const threshold = nowY - RECENT_UPLOAD_YEARS;
  const recent: Scored[] = [];
  const legacy: Scored[] = [];
  for (const it of items) {
    const y = yearFromPublishedAt(it.video.publishedAt);
    if (y != null && y >= threshold) {
      recent.push(it);
    } else {
      legacy.push(it);
    }
  }
  recent.sort((a, b) => b.rank - a.rank);
  legacy.sort((a, b) => b.rank - a.rank);

  const out: Scored[] = [];
  let i = 0;
  let j = 0;
  let takeRecent =
    recent.length > 0 &&
    (legacy.length === 0 || recent[0].rank >= legacy[0].rank);
  while (out.length < maxFinal && (i < recent.length || j < legacy.length)) {
    if (takeRecent) {
      if (i < recent.length) {
        out.push(recent[i++]);
      } else if (j < legacy.length) {
        out.push(legacy[j++]);
      }
    } else {
      if (j < legacy.length) {
        out.push(legacy[j++]);
      } else if (i < recent.length) {
        out.push(recent[i++]);
      }
    }
    takeRecent = !takeRecent;
  }
  return out;
}

/**
 * @param maxFinal - 최종 단일곡 후보 수 (음악검색은 여러 개, 라디오 1곡은 1)
 */
export async function runMoodTrackPipeline(
  userInput: string,
  options: { maxFinal?: number } = {}
): Promise<MusicSearchResultItem[]> {
  const maxFinal = Math.max(1, options.maxFinal ?? DEFAULT_MULTI_FINAL);
  const korean = userInput.trim();
  if (!korean) return [];

  const keywords = await expandKoreanToKeywords(korean);
  let webBlob = "";
  try {
    webBlob = await runTavilyToBlob(keywords);
  } catch {
    webBlob = "";
  }

  let candidates: RawCandidate[] = [];
  if (webBlob.trim()) {
    try {
      candidates = await parseCandidatesFromWeb(korean, keywords, webBlob);
    } catch {
      candidates = [];
    }
  }

  const webText = [webBlob, ...candidates.map((c) => `${c.artist} ${c.title} ${c.youtubeUrl ?? ""}`)]
    .join("\n");

  const ids = await collectIdsWithNarrowSearch(korean, candidates, webText);
  if (ids.length === 0) {
    return [];
  }

  const details = await fetchYouTubeVideosFullByIds(ids);
  const pre = filterPreClassification(details);
  if (pre.length === 0) {
    return [];
  }

  let classMap: Map<string, ClassRow> = new Map();
  try {
    classMap = await classifySingleVsPlaylist(korean, pre);
  } catch {
    classMap = new Map();
  }

  const scored: Array<{ video: YouTubeVideo; row: ClassRow; rank: number }> = [];
  for (const v of pre) {
    const row = classMap.get(v.id);
    if (!row) continue;
    if (row.label !== "single") continue;
    if (!row.isOfficialRelease) continue;
    if (row.confidenceScore < MIN_CONFIDENCE) continue;
    // 국내곡 위주: 국내 관련 먼저, 그다음 신뢰도
    const rank =
      (row.koreanDomestic ? 1_000_000 : 0) + row.confidenceScore * 1_000;
    scored.push({ video: v, row, rank });
  }

  scored.sort((a, b) => b.rank - a.rank);

  const unique = dedupeScoredChampions(scored);
  const mixed = interleaveRecentAndLegacy(unique, maxFinal);

  const out: MusicSearchResultItem[] = [];
  for (const { video, row } of mixed) {
    const artist = row.displayArtist || video.channelTitle;
    const title = row.displayTitle || video.title;
    out.push({
      artist,
      title,
      reason: row.reason,
      video,
      moodTags: row.moodTags.length > 0 ? row.moodTags : undefined,
      confidenceScore: row.confidenceScore,
      youtubeUrl: toYoutubeUrl(video.id),
      isOfficialRelease: true,
      koreanDomestic: row.koreanDomestic,
    });
  }
  return out;
}
