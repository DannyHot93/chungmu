// ======================================================
// 음악 검색 시의성 맥락
//
// [차트/스트리밍·뉴스·검색 연동 시 일반적으로 필요한 것]
// - 멜론/지니/벅스: 공식 공개 API가 제한적 → 제휴·스크래핑(약관)·유료 데이터
// - Apple Music: 개발자 프로그램 + MusicKit
// - Google Programmable Search: 검색엔진 ID + API 키 → 뉴스/웹 스니펫 후보
// - 뉴스 API: NewsAPI 등 → 최신 K-pop 기사 제목에서 곡명 추출(추가 파이프라인)
// - 정렬: 발매일·차트 순위·인기도 점수를 합쳐 가중치(현재는 발매일 필터 + 최신순)
// ======================================================

export type DiscoveryContext = {
  calendarYear: number;
  now: Date;
  keywordYears: number[];
  recencyIntent: boolean;
};

/** 키워드에서 연도·트렌드 의도 추출 */
export function buildDiscoveryContext(keyword: string): DiscoveryContext {
  const now = new Date();
  const calendarYear = now.getFullYear();
  const years = new Set<number>();
  for (const m of keyword.matchAll(/\b(20[1-3]\d)\b/g)) {
    const y = Number.parseInt(m[1] ?? "0", 10);
    if (y >= 2000 && y <= calendarYear + 1) years.add(y);
  }
  const recencyIntent =
    /최신|올해|금년|신곡|핫|인기|트렌드|차트|떠오르|요즘|급상승|빌보드|멜론|스트리밍|화제|대세/i.test(
      keyword
    );
  return {
    calendarYear,
    now,
    keywordYears: [...years].sort((a, b) => b - a),
    recencyIntent,
  };
}

export function recentPublishedAfterIso(ctx: DiscoveryContext, monthsBack = 12): string {
  const d = new Date(ctx.now);
  d.setMonth(d.getMonth() - monthsBack);
  return d.toISOString();
}

export function recentYearWindow(ctx: DiscoveryContext): { minYear: number; maxYear: number } {
  if (ctx.keywordYears.length > 0) {
    const target = Math.max(...ctx.keywordYears);
    return { minYear: target, maxYear: target };
  }
  if (ctx.recencyIntent) {
    return { minYear: ctx.calendarYear, maxYear: ctx.calendarYear };
  }
  return { minYear: 1990, maxYear: ctx.calendarYear + 1 };
}
