// ======================================================
// Gemini API — 선곡 기획·곡 큐레이션 (서버에서만 사용)
// 1순위: gemini-3-flash-preview, 실패·결과 부적합 시: gemini-2.5-flash
// ======================================================

import type { ProgramCondition, SongRecommendation, VocalMode } from "@/types";

const MODEL_PRIMARY = "gemini-3-flash-preview";
const MODEL_FALLBACK = "gemini-2.5-flash";
/** Lyria 한→영 스타일 변환 전용 (사용자 규칙: gemini-2.5-flash) */
const MODEL_LYRIA_KO_EN = "gemini-2.5-flash";

const SONG_ROLES = ["오프닝", "브릿지", "배경", "엔딩", "일반"] as const;

function getGeminiApiKey(): string {
  const k =
    process.env.GEMINI_API_KEY?.trim() ??
    process.env.GOOGLE_AI_STUDIO_API_KEY?.trim() ??
    "";
  if (!k) {
    throw new Error(
      "GEMINI_API_KEY(또는 GOOGLE_AI_STUDIO_API_KEY) 환경변수가 설정되지 않았습니다."
    );
  }
  return k;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonRecord(content: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(content);
  if (isRecord(parsed)) return parsed;
  if (Array.isArray(parsed)) return { list: parsed };
  return {};
}

function normalizeRole(value: unknown): SongRecommendation["role"] {
  return SONG_ROLES.includes(value as SongRecommendation["role"])
    ? (value as SongRecommendation["role"])
    : "일반";
}

function normalizeRecommendationItem(
  item: unknown,
  index: number
): SongRecommendation {
  const raw = isRecord(item) ? item : {};
  return {
    order: typeof raw.order === "number" ? raw.order : index + 1,
    title: String(raw.title ?? `추천곡 ${index + 1}`).trim() || `추천곡 ${index + 1}`,
    reason: String(raw.reason ?? "").trim(),
    searchKeyword: String(
      raw.searchKeyword ?? raw.search_keyword ?? raw.keyword ?? ""
    ).trim(),
    mood: String(raw.mood ?? "").trim(),
    role: normalizeRole(raw.role),
  };
}

function extractTextFromGenerateContent(data: unknown): string | null {
  const root = data as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const c0 = root?.candidates?.[0];
  if (!c0) return null;
  const parts = c0?.content?.parts ?? [];
  const texts = parts.map((p) => p.text).filter((t): t is string => typeof t === "string" && t.length > 0);
  if (texts.length === 0) return null;
  return texts.join("\n");
}

function parseApiErrorMessage(body: string): string {
  try {
    const j = JSON.parse(body) as { error?: { message?: string } };
    return j?.error?.message ?? body;
  } catch {
    return body;
  }
}

type JsonAttemptResult =
  | { ok: true; text: string; parsed: Record<string, unknown> }
  | { ok: false; reason: string };

const GEMINI_JSON_FETCH_TIMEOUT_MS = 22_000;

/** 단일 모델로 generateContent (JSON) */
async function tryGenerateContentJson(
  model: string,
  apiKey: string,
  systemText: string,
  userText: string,
  temperature: number
): Promise<JsonAttemptResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const signal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(GEMINI_JSON_FETCH_TIMEOUT_MS)
      : undefined;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents: [
          {
            role: "user",
            parts: [{ text: userText }],
          },
        ],
        generationConfig: {
          temperature,
          responseMimeType: "application/json",
        },
      }),
      signal,
    });
  } catch (e: unknown) {
    const name = e instanceof Error ? e.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      return {
        ok: false,
        reason: `Gemini 응답 대기 ${Math.round(GEMINI_JSON_FETCH_TIMEOUT_MS / 1000)}초 초과`,
      };
    }
    throw e;
  }

  const raw = await res.text();
  if (!res.ok) {
    return { ok: false, reason: `HTTP ${res.status}: ${parseApiErrorMessage(raw)}` };
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "응답 JSON 파싱 실패" };
  }

  const text = extractTextFromGenerateContent(data);
  if (!text?.trim()) {
    return { ok: false, reason: "응답에 텍스트가 없습니다" };
  }

  try {
    const parsed = parseJsonRecord(text.trim());
    return { ok: true, text, parsed };
  } catch {
    return { ok: false, reason: "모델 출력 JSON 파싱 실패" };
  }
}

function pickSongsArray(parsed: Record<string, unknown>): unknown[] {
  const rawList =
    [parsed.songs, parsed.recommendations, parsed.list].find(Array.isArray) ?? [];
  return rawList;
}

/**
 * primary → (실패·빈 결과·JSON 오류) → fallback
 * (분위기 검색 등 다른 모듈에서 JSON 태스크로 재사용)
 */
export async function runGeminiStructuredJson(
  systemText: string,
  userText: string,
  temperature: number,
  validate: (parsed: Record<string, unknown>) => boolean
): Promise<Record<string, unknown>> {
  const apiKey = getGeminiApiKey();
  const primary = await tryGenerateContentJson(
    MODEL_PRIMARY,
    apiKey,
    systemText,
    userText,
    temperature
  );
  if (primary.ok && validate(primary.parsed)) {
    return primary.parsed;
  }

  const fallback = await tryGenerateContentJson(
    MODEL_FALLBACK,
    apiKey,
    systemText,
    userText,
    temperature
  );
  if (fallback.ok && validate(fallback.parsed)) {
    return fallback.parsed;
  }

  if (fallback.ok) {
    throw new Error(
      "AI 응답 형식이 기대와 다릅니다. 잠시 후 다시 시도해 주세요."
    );
  }
  throw new Error(
    `Gemini 호출 실패 (${MODEL_PRIMARY} / ${MODEL_FALLBACK}): ${!primary.ok ? primary.reason : fallback.reason}`
  );
}

/**
 * 한국어 분위기·느낌 설명 → Lyria용 영어 음악 연출 문장 (JSON의 direction)
 * 실패 시 호출부에서 룰 기반 mapKoreanToEnglishPrompt로 폴백
 */
export async function koreanMoodToLyriaEnglishCore(
  koreanText: string,
  vocalMode: VocalMode
): Promise<string> {
  const trimmed = koreanText.trim();
  if (!trimmed) {
    throw new Error("empty");
  }
  const apiKey = getGeminiApiKey();
  const mixHint =
    vocalMode === "vocals"
      ? "The track should feature a clear lead vocal (singer) with balanced backing; describe how the voice should feel along with the band."
      : "Instrumental only: no lead singer; describe texture, harmony, rhythm, and sound design only.";

  const system = `You help with music production briefs for Google Lyria (original music generation only).
The user writes in Korean (any phrasing: mood, scene, broadcast use, feelings). You must understand the intent and express it as English music direction.

Output JSON only, one key "direction":
{ "direction": "<string>" }

Rules for "direction":
- English only. 2–5 sentences or one rich paragraph.
- Use music vocabulary: mood, energy, tempo feel, texture, instruments/synths, genre flavor, spatial feel, dynamics. For broadcast/BGM/radio if implied.
- ${mixHint}
- Do not name real artists, bands, songs, or trademarks. Never say "like [someone]".
- Do not output Korean inside "direction".`;

  const user = `Korean brief:\n${trimmed}`;

  const attempt = await tryGenerateContentJson(
    MODEL_LYRIA_KO_EN,
    apiKey,
    system,
    user,
    0.55
  );
  if (!attempt.ok) {
    throw new Error(attempt.reason);
  }
  const d = attempt.parsed.direction;
  const out = typeof d === "string" ? d.trim() : "";
  if (out.length < 12) {
    throw new Error("direction too short");
  }
  return out;
}

// 라디오 프로그램 선곡 추천 생성
export async function generateProgramRecommendation(
  condition: ProgramCondition
): Promise<SongRecommendation[]> {
  const systemPrompt = `당신은 전문 라디오 PD입니다.
주어진 프로그램 조건에 맞는 음악 선곡 기획안을 JSON 형식으로 출력하세요.
슬롯마다 서로 다른 곡·스타일이 듣도록 다양하게 기획하세요 (동일한 곡·장르를 반복하지 마세요).
반드시 아래 형식의 JSON 객체만 출력하고, 다른 설명은 하지 마세요.

출력 형식:
{
  "songs": [
    {
      "order": 1,
      "title": "추천 곡 장르 또는 스타일 (예: 뉴스 오프닝 테마)",
      "reason": "추천 이유 (2문장 이내)",
      "searchKeyword": "이 슬롯에 맞는 실제 곡을 고를 때 참고할 구체적인 한국어 키워드·용도",
      "mood": "예상 분위기 (예: 차분하고 신뢰감 있는)",
      "role": "오프닝 또는 브릿지 또는 배경 또는 엔딩 또는 일반"
    }
  ]
}`;

  const userPrompt = `다음 조건에 맞는 ${condition.songCount}곡의 선곡 기획안을 JSON으로 출력하세요.

프로그램명: ${condition.programName}
시간대: ${condition.timeSlot || "미지정"}
분위기: ${condition.mood || "미지정"}
청취자층: ${condition.audience || "미지정"}
필요 곡 수: ${condition.songCount}곡
진행 스타일: ${condition.style || "미지정"}`;

  const parsed = await runGeminiStructuredJson(
    systemPrompt,
    userPrompt,
    0.7,
    (p) => pickSongsArray(p).length > 0
  );

  const rawList = pickSongsArray(parsed);
  return rawList.map((item, i) => normalizeRecommendationItem(item, i));
}
