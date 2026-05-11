import { runGeminiStructuredJson } from "./geminiLlm";
import { buildDiscoveryContext } from "./musicDiscovery";

export type MusicUseCase =
  | "radio"
  | "broadcast_bgm"
  | "opening"
  | "news"
  | "comedy"
  | "drama"
  | "general";

export type MusicIntent = {
  originalText: string;
  mood: string[];
  scene: string[];
  useCase: MusicUseCase;
  energy: "low" | "medium" | "high";
  tempo: "slow" | "medium" | "fast";
  genreHints: string[];
  instrumentHints: string[];
  vocalPreference: "vocal" | "instrumental" | "either";
  recencyIntent: boolean;
  targetYears: number[];
  koreanPreference: boolean;
  searchTags: string[];
  avoid: string[];
};

const USE_CASES = new Set<MusicUseCase>([
  "radio",
  "broadcast_bgm",
  "opening",
  "news",
  "comedy",
  "drama",
  "general",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unique(items: string[], max = 12): string[] {
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((v) => String(v).trim()).filter(Boolean)
    : [];
}

function pickEnum<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  const raw = String(value ?? "").trim();
  return allowed.has(raw as T) ? (raw as T) : fallback;
}

function pickLevel(value: unknown, fallback: "low" | "medium" | "high") {
  const raw = String(value ?? "").trim();
  return raw === "low" || raw === "medium" || raw === "high" ? raw : fallback;
}

function pickTempo(value: unknown, fallback: "slow" | "medium" | "fast") {
  const raw = String(value ?? "").trim();
  return raw === "slow" || raw === "medium" || raw === "fast" ? raw : fallback;
}

function pickVocal(value: unknown): MusicIntent["vocalPreference"] {
  const raw = String(value ?? "").trim();
  return raw === "vocal" || raw === "instrumental" || raw === "either" ? raw : "either";
}

function detectLocalIntent(text: string): Omit<MusicIntent, "originalText"> {
  const ctx = buildDiscoveryContext(text);
  const t = text.toLowerCase();
  const mood: string[] = [];
  const scene: string[] = [];
  const genreHints: string[] = [];
  const instrumentHints: string[] = [];
  const searchTags: string[] = [];
  const avoid = ["playlist", "1 hour mix", "fan cover", "ai cover", "karaoke"];
  let useCase: MusicUseCase = "general";
  let energy: MusicIntent["energy"] = "medium";
  let tempo: MusicIntent["tempo"] = "medium";
  let vocalPreference: MusicIntent["vocalPreference"] = "either";

  if (/웃긴|웃음|유머|코미디|예능|재미|유쾌|밝은|기분/.test(text)) {
    mood.push("밝은", "유쾌한", "가벼운");
    scene.push("코미디", "예능");
    genreHints.push("k-pop", "dance pop", "funk", "city pop");
    searchTags.push("happy", "upbeat", "feel good", "funky", "dance pop");
    useCase = "comedy";
    energy = "high";
    tempo = "fast";
    avoid.push("dark ballad", "sad ballad");
  }

  if (/비|새벽|퇴근|쓸쓸|감성|잔잔|차분|밤|그리움|아련/.test(text)) {
    mood.push("감성적인", "차분한", "아련한");
    scene.push("밤", "라디오");
    genreHints.push("ballad", "indie", "r&b", "chill pop");
    searchTags.push("chill", "sad", "indie", "rnb", "ballad");
    energy = "low";
    tempo = "slow";
    vocalPreference = "vocal";
  }

  if (/뉴스|긴장|사건|예고|스릴|추적|위기|심각/.test(text)) {
    mood.push("긴장감 있는", "진지한");
    scene.push("뉴스", "예고");
    genreHints.push("cinematic", "electronic", "ambient");
    instrumentHints.push("strings", "synth", "percussion");
    searchTags.push("tense", "cinematic", "electronic", "dark");
    useCase = "news";
    energy = "medium";
    tempo = "medium";
    vocalPreference = "instrumental";
    avoid.push("cute", "happy pop");
  }

  if (/오프닝|시작|타이틀/.test(text)) useCase = "opening";
  if (/라디오/.test(text)) useCase = "radio";
  if (/브금|bgm|배경/.test(t)) useCase = "broadcast_bgm";
  if (/드라마|사연|서사/.test(text)) useCase = "drama";
  if (/여자\s*아이돌|걸그룹/.test(text)) searchTags.push("k-pop girl group");
  if (/남자\s*아이돌|보이그룹/.test(text)) searchTags.push("k-pop boy group");
  if (/국내|한국|케이팝|k-pop|가요|아이돌|ost/i.test(text)) searchTags.push("k-pop", "korean");

  return {
    mood: unique(mood),
    scene: unique(scene),
    useCase,
    energy,
    tempo,
    genreHints: unique(genreHints),
    instrumentHints: unique(instrumentHints),
    vocalPreference,
    recencyIntent: ctx.recencyIntent,
    targetYears: ctx.keywordYears,
    koreanPreference: true,
    searchTags: unique(searchTags.length > 0 ? searchTags : ["k-pop", "korean pop"]),
    avoid: unique(avoid),
  };
}

function normalizeIntent(input: string, parsed: Record<string, unknown>): MusicIntent {
  const local = detectLocalIntent(input);
  const yearsRaw = Array.isArray(parsed.targetYears) ? parsed.targetYears : parsed.target_years;
  const targetYears = Array.isArray(yearsRaw)
    ? yearsRaw
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v >= 1990 && v <= 2030)
    : [];

  return {
    originalText: input,
    mood: unique([...stringArray(parsed.mood), ...local.mood]),
    scene: unique([...stringArray(parsed.scene), ...local.scene]),
    useCase: pickEnum(parsed.useCase ?? parsed.use_case, USE_CASES, local.useCase),
    energy: pickLevel(parsed.energy, local.energy),
    tempo: pickTempo(parsed.tempo, local.tempo),
    genreHints: unique([...stringArray(parsed.genreHints ?? parsed.genre_hints), ...local.genreHints]),
    instrumentHints: unique([
      ...stringArray(parsed.instrumentHints ?? parsed.instrument_hints),
      ...local.instrumentHints,
    ]),
    vocalPreference: pickVocal(parsed.vocalPreference ?? parsed.vocal_preference),
    recencyIntent: Boolean(parsed.recencyIntent ?? parsed.recency_intent ?? local.recencyIntent),
    targetYears: unique([...targetYears.map(String), ...local.targetYears.map(String)])
      .map((v) => Number(v))
      .filter((v) => Number.isInteger(v)),
    koreanPreference: parsed.koreanPreference === false ? false : local.koreanPreference,
    searchTags: unique([...stringArray(parsed.searchTags ?? parsed.search_tags), ...local.searchTags]),
    avoid: unique([...stringArray(parsed.avoid), ...local.avoid]),
  };
}

export function fallbackMusicIntent(input: string): MusicIntent {
  return { originalText: input, ...detectLocalIntent(input) };
}

export async function resolveMusicIntent(input: string): Promise<MusicIntent> {
  const trimmed = input.trim();
  if (!trimmed) return fallbackMusicIntent(input);

  const system = `당신은 한국 방송국 음악 검색용 의도 해석기입니다.
사용자 상황문을 실제 곡 DB 검색에 쓸 구조화 JSON으로만 바꾸세요.

규칙:
- 절대 실제 곡명이나 아티스트를 추천하거나 지어내지 마세요.
- mood/scene은 한국어 짧은 단어, genreHints/searchTags는 Last.fm/iTunes 검색에 유리한 영어 태그를 섞으세요.
- 최신/요즘/신곡/올해/연도 표현이 있으면 recencyIntent 또는 targetYears에 반영하세요.
- 국내곡 선호가 명시되지 않아도 한국 방송 업무 맥락이면 koreanPreference=true로 둡니다.
- JSON만 출력하세요.`;

  const user = `입력: ${trimmed}

형식:
{
  "mood": ["..."],
  "scene": ["..."],
  "useCase": "radio|broadcast_bgm|opening|news|comedy|drama|general",
  "energy": "low|medium|high",
  "tempo": "slow|medium|fast",
  "genreHints": ["..."],
  "instrumentHints": ["..."],
  "vocalPreference": "vocal|instrumental|either",
  "recencyIntent": true,
  "targetYears": [2026],
  "koreanPreference": true,
  "searchTags": ["..."],
  "avoid": ["..."]
}`;

  try {
    const parsed = await runGeminiStructuredJson(system, user, 0.25, (x) => {
      if (!isRecord(x)) return false;
      return Array.isArray(x.searchTags ?? x.search_tags) || Array.isArray(x.genreHints ?? x.genre_hints);
    });
    return normalizeIntent(trimmed, parsed);
  } catch {
    return fallbackMusicIntent(trimmed);
  }
}
