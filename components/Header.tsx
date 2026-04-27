// ======================================================
// 헤더 — 검정 배경 + 포인트 블루 (#4764e6)
// ======================================================

export default function Header() {
  return (
    <header className="border-b border-zinc-800 bg-black text-white shadow-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="rounded bg-[#4764e6] px-3 py-1 text-lg font-black text-white select-none">
            ON
          </div>
          <div>
            <h1 className="text-lg font-black leading-tight tracking-tight">충뮤ChungMu</h1>
            <p className="text-xs tracking-widest text-zinc-500">
              음악 검색 · AI 생성 · 라디오 선곡
            </p>
          </div>
        </div>

        <div className="hidden items-center gap-2 text-xs text-[#7c94f0] md:flex">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-400" />
          LIVE ON AIR
        </div>
      </div>
    </header>
  );
}
