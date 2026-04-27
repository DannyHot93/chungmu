// ======================================================
// GET /api/search-youtube?q= — /api/search-music 과 동일 (하위 호환 URL)
// ======================================================

import { NextRequest, NextResponse } from "next/server";
import { runAiFirstMusicSearch } from "@/lib/musicSearch";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json({ error: "검색어 q가 필요합니다." }, { status: 400 });
  }

  try {
    const results = await runAiFirstMusicSearch(q);
    if (results.length === 0) {
      return NextResponse.json(
        { error: "선정된 곡이 없습니다. 키워드를 바꿔 다시 시도해 주세요." },
        { status: 422 }
      );
    }
    return NextResponse.json({ results, keyword: q });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "검색 중 오류가 발생했습니다.";
    console.error("[search-youtube] 오류:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
