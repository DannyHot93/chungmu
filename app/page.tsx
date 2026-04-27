"use client";

// ======================================================
// 메인 — 배경 #000 / 메뉴 #4764e6 (MBC 계열 톤)
// ======================================================

import { useState } from "react";
import Header from "@/components/Header";
import SearchSection from "@/components/SearchSection";
import GenerateSection from "@/components/GenerateSection";
import ProgramPlannerSection from "@/components/ProgramPlannerSection";

type Tab = "search" | "generate" | "planner";

const TABS: { id: Tab; label: string; sub: string; icon: string }[] = [
  { id: "search", label: "음악 검색", sub: "AI→YouTube", icon: "🔍" },
  { id: "generate", label: "AI 음악 생성", sub: "Lyria", icon: "🎼" },
  { id: "planner", label: "라디오 선곡", sub: "AI 기획", icon: "📻" },
];

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>("search");

  return (
    <div className="min-h-screen bg-black text-zinc-200">
      <Header />

      <nav className="border-b border-[#3d56c9] bg-[#4764e6]">
        <div className="mx-auto flex max-w-6xl overflow-x-auto px-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? "border-white bg-[#3d56c9] text-white"
                  : "border-transparent text-white/85 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className="hidden sm:inline mr-1">{tab.icon}</span>
              <span>{tab.label}</span>
              <span className="hidden md:inline ml-1 text-xs font-normal opacity-80">
                ({tab.sub})
              </span>
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/90 shadow-xl">
          <div className="border-b border-zinc-800 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="h-6 w-1 rounded bg-[#4764e6]" />
              <div>
                <h2 className="text-base font-bold text-white">
                  {TABS.find((t) => t.id === activeTab)?.label}
                </h2>
              </div>
            </div>
          </div>

          <div className="p-5">
            {activeTab === "search" && <SearchSection />}
            {activeTab === "generate" && <GenerateSection />}
            {activeTab === "planner" && <ProgramPlannerSection />}
          </div>
        </div>
      </main>

      <footer className="mt-4 border-t border-zinc-800 py-6 text-center text-xs text-zinc-600">
        <p>© 충뮤 · 내부 업무용</p>
        <p className="mt-1">YouTube · Lyria 2 / Lyria 3 Pro · Gemini</p>
      </footer>
    </div>
  );
}
