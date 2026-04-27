// ======================================================
// Google Vertex AI — Lyria 2 (lyria-002) :predict — 짧은 클립 (~30초 WAV)
// recitation(저작권·모방) 차단 시: 사용자 안내 메시지 + 안전 프롬프트 1회 재시도
// ======================================================

import { GoogleAuth } from "google-auth-library";
import type { VocalMode } from "@/types";
import {
  mapKoreanToEnglishPrompt,
  buildMinimalRetryPrompt,
} from "./koreanPromptMapper";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID ?? "lyria2-493404";
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";
const ENDPOINT = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/lyria-002:predict`;

async function getAccessToken(): Promise<string> {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse.token) {
    throw new Error(
      "Google 액세스 토큰을 가져올 수 없습니다. " +
        "gcloud auth application-default login을 실행했는지 확인하세요."
    );
  }
  return tokenResponse.token;
}

export interface LyriaResult {
  audioBase64: string;
  promptUsed: string;
  koreanInput: string;
  /** true면 첫 프롬프트가 recitation에 걸려 최소 프롬프트로 재시도한 경우 */
  usedRetryPrompt?: boolean;
}

function isRecitationBlockMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("recitation") ||
    m.includes("blocked by recitation") ||
    m.includes("all responses were blocked")
  );
}

/** HTTP 오류 본문에서 Google error.message 추출 */
function parseGoogleErrorMessage(errText: string): string {
  try {
    const j = JSON.parse(errText) as {
      error?: { message?: string };
    };
    return j?.error?.message ?? errText;
  } catch {
    return errText;
  }
}

async function callLyriaPredict(prompt: string, accessToken: string): Promise<Response> {
  return fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1 },
    }),
  });
}

function extractAudioBase64(data: unknown): string | undefined {
  const d = data as { predictions?: Array<{ bytesBase64Encoded?: string }> };
  return d?.predictions?.[0]?.bytesBase64Encoded;
}

export async function generateMusicWithLyria(
  koreanInput: string,
  vocalMode: VocalMode = "instrumental"
): Promise<LyriaResult> {
  const accessToken = await getAccessToken();
  let englishPrompt = mapKoreanToEnglishPrompt(koreanInput, vocalMode);

  let res = await callLyriaPredict(englishPrompt, accessToken);

  let usedRetryPrompt = false;

  if (!res.ok) {
    const errText = await res.text();
    const googleMsg = parseGoogleErrorMessage(errText);

    if (res.status === 400 && isRecitationBlockMessage(googleMsg)) {
      // 1회: 최소·중립 프롬프트로 재시도 (테마/뉴스 등 연상 단어 제거)
      const retryPrompt = buildMinimalRetryPrompt(vocalMode);
      usedRetryPrompt = true;
      res = await callLyriaPredict(retryPrompt, accessToken);
      englishPrompt = retryPrompt;

      if (!res.ok) {
        const errText2 = await res.text();
        throw new Error(
          "Lyria가 콘텐츠 정책(recitation)으로 생성을 거부했습니다. " +
            "키워드를 더 짧고 일반적인 분위기 표현만 써서 다시 시도해 주세요. " +
            `(재시도 후에도 실패: ${parseGoogleErrorMessage(errText2)})`
        );
      }
    } else {
      throw new Error(`Lyria 2 API 오류 (HTTP ${res.status}): ${errText}`);
    }
  }

  const data = await res.json();
  const audioBase64 = extractAudioBase64(data);

  if (!audioBase64) {
    throw new Error(
      "Lyria 2 응답에서 오디오 데이터를 찾을 수 없습니다. API 응답 형식을 확인하세요."
    );
  }

  return {
    audioBase64,
    promptUsed: englishPrompt,
    koreanInput,
    usedRetryPrompt,
  };
}
