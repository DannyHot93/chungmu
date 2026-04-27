// ======================================================
// POST /api/search-music
// Body: { q: string } — Gemini로 곡 선정 후 곡별 YouTube 매칭
// ======================================================

import { NextRequest, NextResponse } from "next/server";
import { runAiFirstMusicSearch } from "@/lib/musicSearch";

async function handleSearch(q: string) {
  const results = await runAiFirstMusicSearch(q);
  if (results.length === 0) {
    return NextResponse.json(
      { error: "선정된 곡이 없습니다. 키워드를 바꿔 다시 시도해 주세요." },
      { status: 422 }
    );
  }
  return NextResponse.json({ results, keyword: q });
}

/** 쿼리스트링 q — GET /api/search-music?q=... */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ error: "q(검색 키워드)가 필요합니다." }, { status: 400 });
  }
  try {
    return await handleSearch(q);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "검색 중 오류가 발생했습니다.";
    console.error("[search-music] 오류:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const q = typeof body?.q === "string" ? body.q.trim() : "";

  if (!q) {
    return NextResponse.json({ error: "q(검색 키워드)가 필요합니다." }, { status: 400 });
  }

  try {
    return await handleSearch(q);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "검색 중 오류가 발생했습니다.";
    console.error("[search-music] 오류:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
