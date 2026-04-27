// ======================================================
// 한국어 키워드 → Lyria용 영어 프롬프트 (룰 베이스)
//
// 보컬/악기는 "제거" 부정 프롬프트 대신, 모드별 긍정 문구로만 구분합니다.
// ======================================================

import type { VocalMode } from "@/types";

/** 원곡 모방 회피(정책) — 보컬·악기 제거 같은 부정 문구는 쓰지 않음 */
const ORIGINALITY_SUFFIX =
  " wholly original composition, not imitating any specific song or melody.";

/** 모드별: 무엇을 ‘넣을지’만 서술 (no vocals / no instruments 같은 제거 표현 없음) */
function vocalModeClause(mode: VocalMode): string {
  if (mode === "instrumental") {
    return (
      " Instrument-focused mix: melody and harmony carried by instruments, pads, bass, and drums; " +
      "rich arrangement without a lead vocal line."
    );
  }
  return (
    " Song with lead vocals and backing harmonies, full mix balancing voice with instruments; " +
    "expressive vocal performance with band or accompaniment."
  );
}

// --- 감정 키워드 ---
const EMOTION_MAP: Record<string, string> = {
  긴장감: "tense",
  불안한: "anxious",
  몽환적인: "dreamy",
  희망찬: "uplifting",
  감동적인: "emotional",
  슬픈: "sad",
  슬픔: "sad",
  쓸쓸한: "lonely",
  따뜻한: "warm",
  밝은: "bright",
  어두운: "dark",
  무서운: "scary",
  신비로운: "mysterious",
  웅장한: "epic",
  차분한: "calm",
  평화로운: "peaceful",
  로맨틱한: "romantic",
  귀여운: "playful",
  즐거운: "cheerful",
  강렬한: "intense",
  비장한: "dramatic",
};

// --- 장르 ---
const GENRE_MAP: Record<string, string> = {
  시네마틱: "cinematic",
  오케스트라: "orchestral",
  전자음악: "electronic",
  앰비언트: "ambient",
  피아노: "piano-based",
  록: "rock",
  락: "rock",
  팝: "pop",
  재즈: "jazz",
  트레일러: "trailer-style",
  다큐: "documentary-style",
  게임: "game soundtrack style",
};

// --- 템포 ---
const TEMPO_MAP: Record<string, string> = {
  느린: "slow tempo",
  중간: "medium tempo",
  빠른: "fast tempo",
  "점점 고조되는": "gradually building energy",
  "박진감 있는": "driving rhythm",
  박진감있는: "driving rhythm",
  박진감: "driving rhythm",
};

// --- 악기 / 사운드 질감 ---
const INSTRUMENT_MAP: Record<string, string> = {
  현악기: "with expressive strings",
  브라스: "with bold brass",
  신스: "with pulsing synths",
  드럼: "with punchy drums",
  패드: "with atmospheric pads",
  퍼커션: "with rising percussion",
  기타: "with clean electric guitar",
  합창: "with cinematic choir textures",
};

/**
 * 장르 "피아노"는 piano-based, 악기 문구는 별도 키로 (피아노 연주 질감)
 * GENRE의 피아노와 구분하기 위해 악기 쪽 키를 분리
 */
const INSTRUMENT_MAP_PIANO: Record<string, string> = {
  피아노: "with soft piano",
};

/** 방송·편집 용도 등 (기존 보조) */
const LEGACY_MAP: Record<string, string> = {
  새벽: "very quiet early-morning atmosphere",
  뉴스: "news documentary underscore",
  오프닝: "opening build",
  엔딩: "gentle ending resolution",
  라디오: "radio-friendly bed",
  배경: "background underscore",
  브릿지: "bridge transition",
  클라이맥스: "climax build",
  클래식: "classical orchestral colors",
  어쿠스틱: "acoustic ensemble",
  코믹: "playful comic timing",
  전자: "electronic elements",
  신나는: "upbeat energetic",
  신남: "upbeat energetic",
  몽환: "dreamy atmosphere",
  몽환적: "dreamy atmosphere",
  희망: "uplifting mood",
  차분: "calm mood",
  긴장: "tense undertone",
};

const ALL_MAPS: Record<string, string>[] = [
  EMOTION_MAP,
  GENRE_MAP,
  TEMPO_MAP,
  INSTRUMENT_MAP,
  INSTRUMENT_MAP_PIANO,
  LEGACY_MAP,
];

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** 공백 포함 키(구문)는 전체 입력에서 매칭 */
function collectPhraseKeys(input: string, map: Record<string, string>): string[] {
  const out: string[] = [];
  const keys = Object.keys(map)
    .filter((k) => k.includes(" "))
    .sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (input.includes(key)) out.push(map[key]!);
  }
  return out;
}

/** 한 토큰당 맵마다 가장 긴 일치 키 하나만 (부분 문자열 중복 방지: 긴장 vs 긴장감) */
function matchOneInMap(token: string, map: Record<string, string>): string | null {
  const keys = Object.keys(map)
    .filter((k) => !k.includes(" "))
    .sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (token.includes(key)) return map[key]!;
  }
  return null;
}

function collectEnglishTerms(koreanInput: string): string[] {
  const input = normalizeSpaces(koreanInput);
  const terms: string[] = [];

  for (const map of ALL_MAPS) {
    terms.push(...collectPhraseKeys(input, map));
  }

  const tokens = koreanInput.split(/[\s,]+/).filter(Boolean);
  for (const token of tokens) {
    for (const map of ALL_MAPS) {
      const m = matchOneInMap(token, map);
      if (m) terms.push(m);
    }
  }

  return [...new Set(terms)];
}

function fallbackCore(vocalMode: VocalMode): string {
  if (vocalMode === "instrumental") {
    return "calm ambient texture, very soft pads, slow evolving harmony, abstract sound design";
  }
  return "warm song with intimate lead vocal and soft band, gentle dynamics, original melody";
}

export function mapKoreanToEnglishPrompt(
  koreanInput: string,
  vocalMode: VocalMode = "instrumental"
): string {
  const unique = collectEnglishTerms(koreanInput);

  const core =
    unique.length === 0
      ? fallbackCore(vocalMode)
      : `${unique.join(", ")}, synthesized and acoustic blend where appropriate`;

  return `${core}${ORIGINALITY_SUFFIX} ${vocalModeClause(vocalMode)}`;
}

/** Lyria 3 Pro: 길이·믹스 힌트 (부정 프롬프트 없음) */
const LYRIA3_PRO_EXTRA =
  " Professional broadcast-ready mix, clear sections, approximately two minutes, rich dynamics.";

export function mapKoreanToEnglishPromptForPro(
  koreanInput: string,
  vocalMode: VocalMode = "instrumental"
): string {
  const base = mapKoreanToEnglishPrompt(koreanInput, vocalMode);
  return `${base} ${LYRIA3_PRO_EXTRA}`;
}

/**
 * Recitation 차단 후 재시도용 — 중립·짧은 긍정 프롬프트 (보컬 모드 반영)
 */
export function buildMinimalRetryPrompt(vocalMode: VocalMode = "instrumental"): string {
  const soft =
    "soft ambient texture, slow pad layers, gentle harmony, electronic and acoustic blend, spacious reverb, wholly original abstract sound";
  return `${soft}. ${vocalModeClause(vocalMode)}`;
}
