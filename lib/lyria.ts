// ======================================================
// Google Vertex AI — Lyria 2 (lyria-002) :predict — 짧은 클립 (~30초 WAV)
// recitation(저작권·모방) 차단 시: 사용자 안내 메시지 + 안전 프롬프트 1회 재시도
// 인증(택1):
//   - GOOGLE_APPLICATION_CREDENTIALS_JSON: 서비스 계정 키 JSON 전문(권장: Vercel/CI)
//   - GOOGLE_APPLICATION_CREDENTIALS: 키 파일 경로(로컬)
//   - gcloud auth application-default login(로컬 ADC)
// ======================================================

import { GoogleAuth } from "google-auth-library";
import type { VocalMode } from "@/types";
import { buildMinimalRetryPrompt } from "./koreanPromptMapper";
import { resolveLyria2EnglishPrompt } from "./lyriaPromptResolve";

const LOCATION = process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";

function getProjectIdFromKeyEnv(): string | undefined {
  try {
    const c = getServiceAccountCredentialsFromEnv();
    if (c && typeof c.project_id === "string" && c.project_id.length > 0) {
      return c.project_id;
    }
  } catch {
    /* 키 없음 또는 JSON 오류 */
  }
  return undefined;
}

/**
 * Lyria 2 :predict URL의 `projects/{id}` — 서비스 계정 키의 project_id와 일치해야 하는 경우가 대부분.
 * env와 키의 project_id가 다르면 키의 project_id로 호출하고 경고합니다.
 */
function getVertexProjectIdForLyria(): string {
  const envId = process.env.GOOGLE_CLOUD_PROJECT_ID?.trim();
  const fromKey = getProjectIdFromKeyEnv();
  if (fromKey) {
    if (envId && envId !== fromKey) {
      console.warn(
        `[lyria] GOOGLE_CLOUD_PROJECT_ID(${envId})가 서비스 계정 키의 project_id(${fromKey})와 다릅니다. ` +
          `Vertex 요청은 키의 프로젝트(${fromKey})로 보냅니다. ` +
          `Vercel/로컬의 GOOGLE_CLOUD_PROJECT_ID를 ${fromKey}로 맞추면 경고가 사라집니다.`
      );
      return fromKey;
    }
    return envId || fromKey;
  }
  return envId || "lyria2-493404";
}

function getLyriaEndpoint(): string {
  const projectId = getVertexProjectIdForLyria();
  return `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${LOCATION}/publishers/google/models/lyria-002:predict`;
}

const SCOPE = "https://www.googleapis.com/auth/cloud-platform";

/** 서비스 계정 JSON 객체 — Vercel에는 아래 환경변수 중 하나로만 넣을 수 있음 */
function getServiceAccountCredentialsFromEnv(): Record<string, unknown> | null {
  const jsonRaw =
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim() ??
    process.env.GCP_SERVICE_ACCOUNT_KEY?.trim();
  if (jsonRaw) {
    try {
      return JSON.parse(jsonRaw) as Record<string, unknown>;
    } catch {
      throw new Error(
        "GOOGLE_APPLICATION_CREDENTIALS_JSON(또는 GCP_SERVICE_ACCOUNT_KEY)가 " +
          "올바른 JSON이 아닙니다. 서비스 계정 키 전문을 붙여넣으세요."
      );
    }
  }

  const b64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64?.trim();
  if (b64) {
    try {
      const text = Buffer.from(b64, "base64").toString("utf8");
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(
        "GOOGLE_APPLICATION_CREDENTIALS_BASE64를 디코드·JSON 파싱할 수 없습니다. " +
          "로컬에서 `base64 -i sa.json` 등으로 인코딩한 값을 넣으세요."
      );
    }
  }

  return null;
}

function getGoogleAuth(): GoogleAuth {
  const credentials = getServiceAccountCredentialsFromEnv();
  if (credentials) {
    return new GoogleAuth({ scopes: [SCOPE], credentials });
  }
  // 파일 경로(GOOGLE_APPLICATION_CREDENTIALS) 또는 ADC — 서버(Vercel)에는 보통 없음
  return new GoogleAuth({ scopes: [SCOPE] });
}

function credentialsHelpMessage(): string {
  return (
    "Google Cloud 기본 자격 증명을 찾을 수 없습니다. (짧은 음악 · Lyria 2)\n\n" +
    "Vercel: Project → Settings → Environment Variables에 아래 중 하나를 추가한 뒤 재배포하세요.\n" +
    "  • GOOGLE_APPLICATION_CREDENTIALS_JSON — 서비스 계정 키 JSON 전문(한 줄 권장)\n" +
    "  • GOOGLE_APPLICATION_CREDENTIALS_BASE64 — `base64 -i your-key.json | tr -d '\\n'` 결과\n\n" +
    "GCP: IAM → 서비스 계정 → 키 → JSON. Vertex AI User(aiplatform.user) 등 권한 필요.\n\n" +
    "로컬: `gcloud auth application-default login` 또는 " +
    "GOOGLE_APPLICATION_CREDENTIALS=/절대/경로/키.json"
  );
}

async function getAccessToken(): Promise<string> {
  // 배포 환경에서 키 없이 떨어지는 경우를 미리 짚어 줌
  if (process.env.VERCEL) {
    const hasInline =
      Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim()) ||
      Boolean(process.env.GCP_SERVICE_ACCOUNT_KEY?.trim()) ||
      Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64?.trim());
    if (!hasInline) {
      throw new Error(credentialsHelpMessage());
    }
  }

  const auth = getGoogleAuth();
  let client: Awaited<ReturnType<GoogleAuth["getClient"]>>;
  try {
    client = await auth.getClient();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/default credentials|Could not load/i.test(msg)) {
      throw new Error(credentialsHelpMessage());
    }
    throw e;
  }

  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse.token) {
    throw new Error(
      "Google 액세스 토큰을 가져올 수 없습니다. " +
        "서비스 계정 키가 올바른지, JSON에 `private_key`·`client_email`이 있는지 확인하세요."
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

const LYRIA_PREDICT_TIMEOUT_MS = 180_000; // Lyria2 생성은 1~2분 흔함; 무응답 fetch 방지

async function callLyriaPredict(prompt: string, accessToken: string): Promise<Response> {
  const signal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(LYRIA_PREDICT_TIMEOUT_MS)
      : undefined;
  try {
    return await fetch(getLyriaEndpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1 },
      }),
      signal,
    });
  } catch (e: unknown) {
    const name = e instanceof Error ? e.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      throw new Error(
        `Lyria 2 응답이 ${Math.round(LYRIA_PREDICT_TIMEOUT_MS / 1000)}초 안에 오지 않았습니다. ` +
          "Vertex/Lyria 부하이거나 네트워크 지연일 수 있습니다. 잠시 후 다시 시도하세요."
      );
    }
    throw e;
  }
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
  let englishPrompt = await resolveLyria2EnglishPrompt(koreanInput, vocalMode);

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
    } else if (res.status === 403) {
      const pid = getVertexProjectIdForLyria();
      const hint =
        googleMsg.includes("aiplatform.endpoints.predict") ||
        googleMsg.includes("PERMISSION_DENIED")
          ? ` 서비스 계정에 GCP 프로젝트 ${pid} 에 **Vertex AI 사용자**(roles/aiplatform.user, aiplatform.endpoints.predict 포함) 역할이 있는지 확인하세요. IAM 반영까지 1~5분 걸릴 수 있습니다.`
          : "";
      throw new Error(`Lyria 2 API 권한 부족 (HTTP 403): ${googleMsg}${hint}`);
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
