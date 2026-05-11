// ======================================================
// 라디오 선곡 기획 추천 API 라우트 (Gemini + YouTube)
// POST /api/program-recommend
// Body: ProgramCondition 객체
// 흐름: Gemini 슬롯 기획안 → 슬롯마다 AI 실제 곡 선정 → 곡별 YouTube 매칭 (음악 검색과 동일)
// — 슬롯 간 동일 YouTube 영상이 겹치면 키워드 검색으로 다른 후보를 찾음
// ======================================================

import { NextRequest, NextResponse } from "next/server";
import { generateProgramRecommendation } from "@/lib/geminiLlm";
import { runAiFirstMusicSearchOne } from "@/lib/musicSearch";
import {
  dedupeYouTubeVideosById,
  isoDurationToSeconds,
  looksLikePlaylistOrCompilationSnippet,
  looksLikePlaylistTitle,
  searchYouTube,
} from "@/lib/youtube";
import type { ProgramCondition, SongRecommendation, YouTubeVideo } from "@/types";

const FALLBACK_SINGLE_MIN_SEC = 25;
const FALLBACK_SINGLE_MAX_SEC = 900;

function filterSingleTrackFallback(videos: YouTubeVideo[]): YouTubeVideo[] {
  return dedupeYouTubeVideosById(videos).filter((v) => {
    const sec = isoDurationToSeconds(v.duration);
    if (sec < FALLBACK_SINGLE_MIN_SEC || sec > FALLBACK_SINGLE_MAX_SEC) return false;
    if (looksLikePlaylistOrCompilationSnippet(v.title, v.description)) return false;
    return true;
  });
}

function buildSlotSearchKeyword(condition: ProgramCondition, rec: SongRecommendation): string {
  const parts = [
    `프로그램: ${condition.programName}`,
    `${rec.role} 구간`,
    rec.searchKeyword || rec.title,
    rec.mood && `슬롯 분위기: ${rec.mood}`,
    condition.timeSlot && `시간대: ${condition.timeSlot}`,
    condition.mood && `전체 톤: ${condition.mood}`,
    condition.audience && `청취층: ${condition.audience}`,
    condition.style && `진행: ${condition.style}`,
  ];
  return parts.filter(Boolean).join(" · ");
}

async function resolveSlotAgainstUsed(
  rec: SongRecommendation,
  condition: ProgramCondition,
  usedVideoIds: Set<string>
): Promise<SongRecommendation> {
  const kw =
    rec.searchKeyword?.trim() ||
    buildSlotSearchKeyword(condition, rec);

  if (rec.curated) {
    const vid = rec.curated.video?.id;
    if (vid && usedVideoIds.has(vid)) {
      try {
        const candidates = await searchYouTube(kw, 10);
        const alt = filterSingleTrackFallback(candidates).find(
          (c) => !usedVideoIds.has(c.id) && !looksLikePlaylistTitle(c.title)
        );
        if (alt) {
          usedVideoIds.add(alt.id);
          return {
            ...rec,
            curated: {
              ...rec.curated,
              video: alt,
              matchError: undefined,
            },
            youtubeResults: dedupeYouTubeVideosById([alt]),
          };
        }
      } catch (ytErr) {
        console.warn(
          `[program-recommend] 중복 영상 대체 검색 실패 (order ${rec.order}):`,
          ytErr
        );
      }
      return {
        ...rec,
        curated: {
          ...rec.curated,
          video: null,
          matchError:
            "이미 다른 슬롯에서 사용한 영상과 같습니다. 다른 후보를 찾지 못했습니다.",
        },
        youtubeResults: [],
      };
    }
    if (vid) usedVideoIds.add(vid);
    return {
      ...rec,
      youtubeResults: dedupeYouTubeVideosById(rec.youtubeResults ?? []),
    };
  }

  if (rec.youtubeResults?.length) {
    let list = dedupeYouTubeVideosById(rec.youtubeResults);
    const unusedFromList = list.filter((v) => !usedVideoIds.has(v.id));
    if (unusedFromList.length > 0) {
      list = unusedFromList;
      if (list[0]?.id) usedVideoIds.add(list[0].id);
      return { ...rec, youtubeResults: list };
    }
    try {
      const more = await searchYouTube(kw, 10);
      const pick = filterSingleTrackFallback(more).find(
        (c) => !usedVideoIds.has(c.id) && !looksLikePlaylistTitle(c.title)
      );
      if (pick) {
        usedVideoIds.add(pick.id);
        return { ...rec, youtubeResults: [pick] };
      }
    } catch (ytErr) {
      console.warn(
        `[program-recommend] YouTube-only 슬롯 대체 검색 실패 (order ${rec.order}):`,
        ytErr
      );
    }
    return { ...rec, youtubeResults: list };
  }

  return rec;
}

const MAX_PROGRAM_SONGS = 7;
const MIN_PROGRAM_SONGS = 1;

export async function POST(request: NextRequest) {
  const body: ProgramCondition = await request.json().catch(() => null);

  if (!body?.programName || !body.programName.trim()) {
    return NextResponse.json(
      { error: "프로그램명(programName)은 필수 입력값입니다." },
      { status: 400 }
    );
  }

  const rawCount = Number(body.songCount);
  const songCount = Math.min(
    MAX_PROGRAM_SONGS,
    Math.max(MIN_PROGRAM_SONGS, Number.isFinite(rawCount) ? Math.floor(rawCount) : 5)
  );
  const condition: ProgramCondition = { ...body, songCount };

  try {
    const recommendations = await generateProgramRecommendation(condition);

    const enriched = await Promise.all(
      recommendations.map(async (rec) => {
        const slotKeyword = buildSlotSearchKeyword(condition, rec);
        const curated = await runAiFirstMusicSearchOne(slotKeyword);

        if (curated) {
          return {
            ...rec,
            curated,
            youtubeResults: curated.video
              ? dedupeYouTubeVideosById([curated.video])
              : [],
          };
        }

        if (rec.searchKeyword?.trim()) {
          try {
            const results = await searchYouTube(rec.searchKeyword.trim(), 5);
            const filtered = filterSingleTrackFallback(results);
            return {
              ...rec,
              youtubeResults: filtered,
            };
          } catch (ytErr) {
            console.warn(
              `[program-recommend] AI 선곡 실패 후 키워드 YouTube 검색 실패 (${rec.searchKeyword}):`,
              ytErr
            );
          }
        }

        return { ...rec, youtubeResults: [] };
      })
    );

    const sorted = [...enriched].sort((a, b) => a.order - b.order);
    const usedVideoIds = new Set<string>();
    const final: SongRecommendation[] = [];
    for (const rec of sorted) {
      final.push(await resolveSlotAgainstUsed(rec, condition, usedVideoIds));
    }

    return NextResponse.json({ recommendations: final });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "선곡 추천 중 오류가 발생했습니다.";
    console.error("[program-recommend] 오류:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
