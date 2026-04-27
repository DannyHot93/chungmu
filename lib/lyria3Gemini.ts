// ======================================================
// Lyria 3 Pro Preview — Google AI Studio / Gemini API (API 키)
// POST generativelanguage.googleapis.com/v1beta/.../generateContent
// 문서: https://ai.google.dev/gemini-api/docs/music-generation
// ======================================================

import type { VocalMode } from "@/types";
import { mapKoreanToEnglishPromptForPro } from "./koreanPromptMapper";

const MODEL = "lyria-3-pro-preview";
const BASE = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export interface Lyria3GeminiResult {
  audioBase64: string;
  mimeType: string;
  promptUsed: string;
  koreanInput: string;
}

/** Gemini generateContent 응답에서 오디오 파트 추출 (camelCase / snake_case 모두 시도) */
function extractAudioFromResponse(data: unknown): { data: string; mimeType: string } | null {
  const root = data as {
    candidates?: Array<{
      content?: {
        parts?: Array<Record<string, unknown>>;
      };
    }>;
  };

  const parts = root?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline =
      (part as { inlineData?: { mimeType?: string; data?: string } }).inlineData ??
      (part as { inline_data?: { mime_type?: string; data?: string } }).inline_data;
    const mime =
      inline &&
      ("mimeType" in (inline as object)
        ? (inline as { mimeType?: string }).mimeType
        : (inline as { mime_type?: string }).mime_type);
    const b64 = inline && "data" in (inline as object) ? (inline as { data?: string }).data : undefined;
    if (b64 && mime?.startsWith("audio/")) {
      return { data: b64, mimeType: mime };
    }
  }
  return null;
}

function parseApiError(body: string): string {
  try {
    const j = JSON.parse(body) as { error?: { message?: string; status?: string } };
    return j?.error?.message ?? body;
  } catch {
    return body;
  }
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_STUDIO_API_KEY ?? "";
  if (!key.trim()) {
    throw new Error(
      "Lyria 3 Pro용 API 키가 없습니다. .env.local에 GEMINI_API_KEY(또는 GOOGLE_AI_STUDIO_API_KEY)를 설정하세요."
    );
  }
  return key;
}

/**
 * Lyria 3 Pro Preview — 미리 완성된 prompt 문자열을 직접 받는 저수준 함수
 * (route 쪽에서 보컬 전용 프롬프트 등을 직접 빌드해 넘길 때 사용)
 */
export async function generateMusicLyria3ProRaw(
  prompt: string,
  koreanInput: string
): Promise<Lyria3GeminiResult> {
  const apiKey = getApiKey();

  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["AUDIO", "TEXT"] },
    }),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(`Lyria 3 Pro API 오류 (HTTP ${res.status}): ${parseApiError(rawText)}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error("Lyria 3 Pro 응답 JSON 파싱 실패");
  }

  const extracted = extractAudioFromResponse(data);
  if (!extracted) {
    throw new Error(
      "Lyria 3 Pro 응답에 오디오 데이터가 없습니다. API 응답 형식이 바뀌었을 수 있습니다."
    );
  }

  return {
    audioBase64: extracted.data,
    mimeType: extracted.mimeType,
    promptUsed: prompt,
    koreanInput,
  };
}

/**
 * Lyria 3 Pro Preview — 길고 퀄리티 높은 음악 (기본 MP3 등)
 * GEMINI_API_KEY 또는 GOOGLE_AI_STUDIO_API_KEY 환경변수 필요
 */
export async function generateMusicLyria3Pro(
  koreanInput: string,
  vocalMode: VocalMode = "instrumental"
): Promise<Lyria3GeminiResult> {
  const englishPrompt = mapKoreanToEnglishPromptForPro(koreanInput, vocalMode);
  return generateMusicLyria3ProRaw(englishPrompt, koreanInput);
}
