// ======================================================
// Lyria 3 Pro — 보컬 모드용 긴 프롬프트 (Style 블록에 영어 지시)
// ======================================================

export const DEFAULT_KO_LYRICS = `[Verse]
오늘도 조용히 빛나는 하루
바람에 실려 온 작은 마음

[Chorus]
지금 이 순간 너에게 닿아
우리의 노래가 시작돼`;

export const DEFAULT_EN_LYRICS = `[Verse]
Walking through the morning light
Every step feels new and right

[Chorus]
This is our song, forever strong
Carrying us where we belong`;

export function buildLyria3VocalPrompt({
  styleEnglish,
  lyrics,
  lang,
}: {
  /** LLM이 만든 영어 스타일 지시(또는 그대로 둔 한·영) */
  styleEnglish: string;
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
${styleEnglish}

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

  const safeLyrics =
    lyrics && lyrics.trim().length > 0 ? lyrics.trim() : DEFAULT_KO_LYRICS;
  return `Create an original Korean vocal song with a clear lead vocal.

Language:
Korean.

Main goal:
A Korean singer sings the provided Korean lyrics melodically.
The vocal should be clearly audible, natural, and central to the song.

Style:
${styleEnglish}

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
