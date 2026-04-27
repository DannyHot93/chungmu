// ======================================================
// Lyria: 한국어 → 영어(LLM + 룰 폴백) — 생성 경로 공통
// ======================================================

import type { VocalMode } from "@/types";
import { koreanMoodToLyriaEnglishCore } from "./geminiLlm";
import {
  buildLyria2FinalFromCore,
  buildLyria3ProFinalFromCore,
  mapKoreanToEnglishPrompt,
  mapKoreanToEnglishPromptForPro,
} from "./koreanPromptMapper";
function logPromptFallback(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn("[lyria-prompt] LLM 변환 실패, 룰 기반으로 폴백:", msg);
}

export async function resolveLyria2EnglishPrompt(
  korean: string,
  vocalMode: VocalMode
): Promise<string> {
  try {
    const core = await koreanMoodToLyriaEnglishCore(korean, vocalMode);
    return buildLyria2FinalFromCore(core, vocalMode);
  } catch (e) {
    logPromptFallback(e);
    return mapKoreanToEnglishPrompt(korean, vocalMode);
  }
}

export async function resolveLyria3ProEnglishPrompt(
  korean: string,
  vocalMode: VocalMode
): Promise<string> {
  try {
    const core = await koreanMoodToLyriaEnglishCore(korean, vocalMode);
    return buildLyria3ProFinalFromCore(core, vocalMode);
  } catch (e) {
    logPromptFallback(e);
    return mapKoreanToEnglishPromptForPro(korean, vocalMode);
  }
}

/** 긴+보컬: Style 자리엔 LLM이 만든 영어(실패 시 한국어 키워드 그대로) */
export async function resolveVocalStyleBlock(
  koreanKeyword: string,
  vocalMode: VocalMode
): Promise<string> {
  try {
    return await koreanMoodToLyriaEnglishCore(koreanKeyword, vocalMode);
  } catch (e) {
    logPromptFallback(e);
    return koreanKeyword.trim();
  }
}
