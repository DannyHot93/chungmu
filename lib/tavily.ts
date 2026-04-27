// ======================================================
// Tavily Search API (서버 전용)
// https://docs.tavily.com
// ======================================================

const TAVILY_URL = "https://api.tavily.com/search";

export interface TavilyResultItem {
  title: string;
  url: string;
  content: string;
}

function getTavilyApiKey(): string {
  const k = process.env.TAVILY_API_KEY?.trim() ?? "";
  if (!k) {
    throw new Error("TAVILY_API_KEY 환경변수가 설정되지 않았습니다.");
  }
  return k;
}

/**
 * 웹 검색. 곡명·채널·YouTube URL 단서를 모읍니다.
 */
export async function tavilySearch(
  query: string,
  maxResults = 8
): Promise<TavilyResultItem[]> {
  const res = await fetch(TAVILY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: getTavilyApiKey(),
      query: query.trim(),
      search_depth: "advanced",
      max_results: maxResults,
      include_answer: false,
    }),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Tavily API 오류 (HTTP ${res.status}): ${raw.slice(0, 200)}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Tavily 응답 JSON 파싱 실패");
  }
  const root = data as { results?: unknown };
  if (!Array.isArray(root.results)) return [];
  const out: TavilyResultItem[] = [];
  for (const r of root.results) {
    if (typeof r !== "object" || r === null) continue;
    const o = r as { title?: unknown; url?: unknown; content?: unknown };
    out.push({
      title: String(o.title ?? ""),
      url: String(o.url ?? ""),
      content: String(o.content ?? ""),
    });
  }
  return out;
}
