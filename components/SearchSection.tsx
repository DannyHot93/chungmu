"use client";

// ======================================================
// 음악 검색: 키워드 → Gemini 곡 선정 → 곡별 YouTube 재생
// ======================================================

import { useState } from "react";
import { readApiJson } from "@/lib/readApiJson";
import MusicListRow from "./MusicListRow";
import YouTubePlayerModal from "./YouTubePlayerModal";
import type { MusicSearchResultItem, YouTubeVideo } from "@/types";

const EXAMPLE_KEYWORDS = [
  "긴장감 있는 뉴스 오프닝",
  "차분한 새벽 라디오 배경음",
  "희망찬 엔딩 음악",
  "브릿지용 잔잔한 음악",
  "뉴스 클로징 음악",
  "웅장한 오프닝 테마",
];

const PURPOSE_TAGS: Record<string, string> = {
  오프닝: "뉴스 오프닝",
  배경: "배경용",
  엔딩: "엔딩용",
  브릿지: "브릿지",
  라디오: "라디오 배경",
  클로징: "클로징",
  테마: "테마 음악",
};

function detectTag(keyword: string): string {
  for (const [k, v] of Object.entries(PURPOSE_TAGS)) {
    if (keyword.includes(k)) return v;
  }
  return "AI 선곡";
}

export default function SearchSection() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MusicSearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState<YouTubeVideo | null>(null);

  const handleSearch = async (overrideQuery?: string) => {
    const searchQuery = overrideQuery ?? query;
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError("");
    setResults([]);

    try {
      const res = await fetch("/api/search-music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: searchQuery.trim() }),
      });
      const data = await readApiJson<{ results?: MusicSearchResultItem[] }>(res);
      const list = data.results ?? [];
      setResults(list);
      if (list.length === 0) {
        setError("선정된 곡이 없습니다. 다른 키워드로 시도해보세요.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "검색 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeywordClick = (kw: string) => {
    setQuery(kw);
    handleSearch(kw);
  };

  const tag = detectTag(query);
  const playableCount = results.filter((r) => r.video).length;

  return (
    <section className="text-zinc-200">
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="분위기·용도 키워드"
          className="flex-1 rounded border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-[#4764e6] focus:ring-1 focus:ring-[#4764e6]"
        />
        <button
          onClick={() => handleSearch()}
          disabled={loading}
          className="whitespace-nowrap rounded bg-[#4764e6] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#5a75ea] disabled:opacity-50"
        >
          {loading ? "검색 중..." : "검색"}
        </button>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {EXAMPLE_KEYWORDS.map((kw) => (
          <button
            key={kw}
            onClick={() => handleKeywordClick(kw)}
            disabled={loading}
            className="rounded-full border border-zinc-600 px-3 py-1 text-xs text-zinc-300 transition-colors hover:border-[#4764e6] hover:text-white disabled:opacity-40"
          >
            {kw}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-800/80 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-zinc-500">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#4764e6] border-t-transparent" />
          AI 선곡 후 YouTube 매칭 중…
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <p className="mb-2 text-xs font-medium text-zinc-500">
            {results.length}곡 선정
            {playableCount < results.length && (
              <span className="text-zinc-600"> · 재생 가능 {playableCount}곡</span>
            )}
          </p>
          <ol className="m-0 list-none space-y-2 p-0">
            {results.map((item, i) => (
              <MusicListRow
                key={`${item.artist}-${item.title}-${i}`}
                video={item.video}
                index={i + 1}
                onPlay={setPlaying}
                tag={tag}
                songLine={`${item.artist} — ${item.title}`}
                reason={item.reason}
                matchError={
                  item.video
                    ? undefined
                    : item.matchError ?? "이 곡에 맞는 단일 영상을 찾지 못했습니다."
                }
              />
            ))}
          </ol>
        </>
      )}

      {!loading && results.length === 0 && !error && (
        <div className="py-12 text-center text-sm text-zinc-500">
          <p className="mb-3 text-4xl">🎵</p>
          <p>키워드로 검색하세요</p>
        </div>
      )}

      <YouTubePlayerModal video={playing} onClose={() => setPlaying(null)} />
    </section>
  );
}
