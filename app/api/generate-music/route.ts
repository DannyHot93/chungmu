// ======================================================
// AI 음악 생성 API
// POST /api/generate-music
// Body: { keyword, mode?, vocalMode?, lyrics?, lyricsLanguage?: "ko" | "en" }
//   short          → Lyria 2 (Vertex, ~30초 WAV)
//   long+inst      → Lyria 3 Pro (Gemini API, 영어 프롬프트)
//   long+vocals    → Lyria 3 Pro (Gemini API, 언어별 보컬 전용 프롬프트)
// 오디오는 Vercel Blob에 업로드 후 URL 반환 (Base64 전송 최소화)
// BLOB_READ_WRITE_TOKEN 미설정 시 Base64 폴백
// ======================================================

import { NextRequest, NextResponse } from "next/server";
import type { VocalMode } from "@/types";
import { generateMusicWithLyria } from "@/lib/lyria";
import { generateMusicLyria3Pro, generateMusicLyria3ProRaw } from "@/lib/lyria3Gemini";
import { put } from "@vercel/blob";

const DEFAULT_KO_LYRICS = `[Verse]
오늘도 조용히 빛나는 하루
바람에 실려 온 작은 마음

[Chorus]
지금 이 순간 너에게 닿아
우리의 노래가 시작돼`;

const DEFAULT_EN_LYRICS = `[Verse]
Walking through the morning light
Every step feels new and right

[Chorus]
This is our song, forever strong
Carrying us where we belong`;

function parseVocalMode(body: Record<string, unknown>): VocalMode {
  const v = body.vocalMode;
  if (v === "vocals" || v === "instrumental") return v;
  return "instrumental";
}

function parseLyricsLanguage(body: Record<string, unknown>): "ko" | "en" {
  return body.lyricsLanguage === "en" ? "en" : "ko";
}

function buildLyria3VocalPrompt({
  keyword,
  lyrics,
  lang,
}: {
  keyword: string;
  lyrics?: string;
  lang: "ko" | "en";
}): string {
  if (lang === "en") {
    const safeLyrics =
      lyrics && lyrics.trim().length > 0 ? lyrics.trim() : DEFAULT_EN_LYRICS;
    return `Create an original English pop vocal song with a clear lead vocal.

Language:
English.

Main goal:
A singer sings the provided English lyrics melodically.
The vocal should be clearly audible, natural, and central to the song.

Style:
${keyword}

Vocal direction:
Clear English lead vocal.
Natural English pronunciation.
Melodic singing, not spoken narration.
The verse should start with a vocal melody.
The chorus should have a catchy English vocal hook.
The vocal should feel radio-ready and broadcast-friendly.

Music direction:
Modern pop production.
Warm, polished, emotional, and broadcast-friendly.
Use tasteful instrumentation that supports the vocal.
Keep the mix clean and not too crowded.

Lyrics:
${safeLyrics}

Structure:
[Intro] short instrumental intro
[Verse] English lead vocal begins
[Chorus] memorable English vocal hook
[Outro] short ending

Artist guidance:
Original song only.
Do not imitate any real artist, real singer, or existing song.`.trim();
  }

  // ko
  const safeLyrics =
    lyrics && lyrics.trim().length > 0 ? lyrics.trim() : DEFAULT_KO_LYRICS;
  return `Create an original Korean vocal song with a clear lead vocal.

Language:
Korean.

Main goal:
A Korean singer sings the provided Korean lyrics melodically.
The vocal should be clearly audible, natural, and central to the song.

Style:
${keyword}

Vocal direction:
Clear Korean lead vocal.
Natural Korean pronunciation.
Melodic singing, not spoken narration.
The verse should start with a Korean vocal.
The chorus should have a memorable Korean vocal hook.
The vocal should feel suitable for radio or broadcast use.

Music direction:
Modern Korean pop production.
Warm, polished, emotional, and broadcast-friendly.
Use tasteful instrumentation that supports the vocal.
Keep the mix clean and not too crowded.

Lyrics:
${safeLyrics}

Structure:
[Intro] short instrumental intro
[Verse] Korean lead vocal begins
[Chorus] memorable Korean vocal hook
[Outro] short ending

Artist guidance:
Original song only.
Do not imitate any real artist, real singer, or existing song.`.trim();
}

/** Base64 오디오를 Vercel Blob에 업로드하고 공개 URL을 반환.
 *  BLOB_READ_WRITE_TOKEN 미설정 시 null 반환 → 클라이언트가 Base64 폴백 처리. */
async function uploadAudioToBlob(
  base64: string,
  mimeType: string,
  slug: string
): Promise<string | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const ext = mimeType.includes("mp3") || mimeType.includes("mpeg") ? "mp3" : "wav";
    const bytes = Buffer.from(base64, "base64");
    const { url } = await put(`chungmu-audio/${slug}.${ext}`, bytes, {
      access: "public",
      contentType: mimeType,
      addRandomSuffix: true,
    });
    return url;
  } catch (err) {
    console.warn("[generate-music] Blob 업로드 실패, Base64 폴백:", err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body?.keyword || typeof body.keyword !== "string" || !body.keyword.trim()) {
    return NextResponse.json(
      { error: "keyword 필드(분위기·스타일 키워드)가 필요합니다." },
      { status: 400 }
    );
  }

  const mode = body.mode === "long" ? "long" : "short";
  const keyword = body.keyword.trim();
  const vocalMode = parseVocalMode(body as Record<string, unknown>);
  const lyrics = typeof body.lyrics === "string" ? body.lyrics.trim() : "";
  const lyricsLanguage = parseLyricsLanguage(body as Record<string, unknown>);

  try {
    let audioBase64: string;
    let mimeType: string;
    let promptUsed: string;
    let koreanInput: string;
    let usedRetryPrompt = false;
    let model: "lyria2" | "lyria3pro";
    let responseLyricsLanguage: "ko" | "en" | undefined;

    if (mode === "long" && vocalMode === "vocals") {
      const prompt = buildLyria3VocalPrompt({ keyword, lyrics, lang: lyricsLanguage });
      const result = await generateMusicLyria3ProRaw(prompt, keyword);
      audioBase64 = result.audioBase64;
      mimeType = result.mimeType;
      promptUsed = result.promptUsed;
      koreanInput = result.koreanInput;
      model = "lyria3pro";
      responseLyricsLanguage = lyricsLanguage;
    } else if (mode === "long") {
      const result = await generateMusicLyria3Pro(keyword, vocalMode);
      audioBase64 = result.audioBase64;
      mimeType = result.mimeType;
      promptUsed = result.promptUsed;
      koreanInput = result.koreanInput;
      model = "lyria3pro";
    } else {
      const result = await generateMusicWithLyria(keyword, vocalMode);
      audioBase64 = result.audioBase64;
      mimeType = "audio/wav";
      promptUsed = result.promptUsed;
      koreanInput = result.koreanInput;
      usedRetryPrompt = result.usedRetryPrompt;
      model = "lyria2";
    }

    // Blob 업로드 시도: 성공하면 URL만 반환, 실패하면 Base64 폴백
    const slug = `${model}-${Date.now()}`;
    const blobUrl = await uploadAudioToBlob(audioBase64, mimeType, slug);

    if (blobUrl) {
      return NextResponse.json({
        audioUrl: blobUrl,
        audioMimeType: mimeType,
        promptUsed,
        koreanInput,
        usedRetryPrompt,
        model,
        vocalMode,
        ...(responseLyricsLanguage ? { lyricsLanguage: responseLyricsLanguage } : {}),
      });
    }

    // BLOB_READ_WRITE_TOKEN 없거나 업로드 실패 시 Base64 폴백
    return NextResponse.json({
      audioBase64,
      audioMimeType: mimeType,
      promptUsed,
      koreanInput,
      usedRetryPrompt,
      model,
      vocalMode,
      ...(responseLyricsLanguage ? { lyricsLanguage: responseLyricsLanguage } : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "음악 생성 중 오류가 발생했습니다.";
    console.error("[generate-music] 오류:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
