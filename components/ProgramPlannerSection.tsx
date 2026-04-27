"use client";

// ======================================================
// 라디오 편성 선곡 도우미 섹션
// 프로그램 조건 → 슬롯 기획안 → 슬롯마다 AI 실제 곡 선정·YouTube 매칭 (음악 검색과 동일)
// ======================================================

import { useMemo, useState } from "react";
import { readApiJson } from "@/lib/readApiJson";
import {
  formatDurationKorean,
  formatSecondsClock,
  isoDurationToSeconds,
  parseDuration,
} from "@/lib/youtube";
import RadioTrackTable, { type RadioTrackRowModel } from "./RadioTrackTable";
import YouTubePlayerModal from "./YouTubePlayerModal";
import type { ProgramCondition, SongRecommendation, YouTubeVideo } from "@/types";

const DEFAULT_CONDITION: ProgramCondition = {
  programName: "",
  timeSlot: "",
  mood: "",
  audience: "",
  songCount: 5,
  style: "",
};

// 역할별 배지 색상
const ROLE_COLORS: Record<string, string> = {
  오프닝: "border-blue-500/40 bg-blue-950/60 text-blue-200",
  브릿지: "border-yellow-500/40 bg-yellow-950/40 text-yellow-100",
  배경: "border-emerald-500/40 bg-emerald-950/40 text-emerald-100",
  엔딩: "border-purple-500/40 bg-purple-950/40 text-purple-100",
  일반: "border-zinc-600 bg-zinc-800 text-zinc-300",
};

// 예시 프로그램 조건 (빠른 입력용)
const EXAMPLE_PROGRAMS = [
  {
    label: "아침 뉴스",
    data: {
      programName: "아침 뉴스 오프닝",
      timeSlot: "오전 7시",
      mood: "차분하고 신뢰감 있는",
      audience: "30~50대 직장인",
      songCount: 5,
      style: "뉴스 리포트 중심",
    },
  },
  {
    label: "심야 라디오",
    data: {
      programName: "깊은 밤의 라디오",
      timeSlot: "자정~새벽 2시",
      mood: "감성적이고 차분한",
      audience: "20~30대 야행성",
      songCount: 5,
      style: "음악 중심, 조용한 진행",
    },
  },
  {
    label: "주말 특집",
    data: {
      programName: "주말 오후 특집 쇼",
      timeSlot: "오후 2시",
      mood: "밝고 에너지 넘치는",
      audience: "전 연령대",
      songCount: 7,
      style: "다양한 장르 믹스",
    },
  },
];

function buildSlotTrackRows(
  recommendations: SongRecommendation[]
): { totalProgramSec: number; rowsBySlot: Map<number, RadioTrackRowModel[]> } {
  let acc = 0;
  const rowsBySlot = new Map<number, RadioTrackRowModel[]>();

  for (const rec of recommendations) {
    const list: RadioTrackRowModel[] = [];
    let slotIdx = 0;

    if (rec.curated) {
      slotIdx += 1;
      const v = rec.curated.video;
      const dur = v ? isoDurationToSeconds(v.duration) : 0;
      let startSec: number | null = null;
      let endSec: number | null = null;
      if (v && dur >= 0) {
        startSec = acc;
        endSec = acc + dur;
        acc = endSec;
      }
      const infoParts = [rec.reason, rec.curated.reason].filter(Boolean);
      list.push({
        id: `slot-${rec.order}-curated`,
        displayIndex: slotIdx,
        video: v,
        title: rec.curated.title,
        artist: rec.curated.artist,
        lengthLabel: v ? parseDuration(v.duration) : "—",
        startClock: startSec !== null ? formatSecondsClock(startSec) : null,
        endClock: endSec !== null ? formatSecondsClock(endSec) : null,
        infoText: infoParts.length ? infoParts.join(" · ") : undefined,
        matchError: v
          ? undefined
          : rec.curated.matchError ?? "이 곡에 맞는 단일 영상을 찾지 못했습니다.",
        isAlternate: false,
      });
    } else if (rec.youtubeResults && rec.youtubeResults.length > 0) {
      rec.youtubeResults.forEach((v, i) => {
        slotIdx += 1;
        const dur = isoDurationToSeconds(v.duration);
        const isPrimary = i === 0;
        let startSec: number | null = null;
        let endSec: number | null = null;
        if (isPrimary) {
          startSec = acc;
          endSec = acc + dur;
          acc = endSec;
        }
        list.push({
          id: `slot-${rec.order}-yt-${v.id}`,
          displayIndex: slotIdx,
          video: v,
          title: v.title,
          artist: v.channelTitle,
          lengthLabel: parseDuration(v.duration),
          startClock: startSec !== null ? formatSecondsClock(startSec) : null,
          endClock: endSec !== null ? formatSecondsClock(endSec) : null,
          infoText: rec.reason,
          isAlternate: !isPrimary,
        });
      });
    }

    rowsBySlot.set(rec.order, list);
  }

  return { totalProgramSec: acc, rowsBySlot };
}

export default function ProgramPlannerSection() {
  const [condition, setCondition] = useState<ProgramCondition>(DEFAULT_CONDITION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recommendations, setRecommendations] = useState<SongRecommendation[]>([]);
  const [playing, setPlaying] = useState<YouTubeVideo | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  const { totalProgramSec, rowsBySlot } = useMemo(
    () => buildSlotTrackRows(recommendations),
    [recommendations]
  );

  const totalLabel = formatDurationKorean(totalProgramSec);

  const updateField = (field: keyof ProgramCondition, value: string | number) =>
    setCondition((prev) => ({ ...prev, [field]: value }));

  const handleRecommend = async () => {
    if (!condition.programName.trim()) {
      setError("프로그램명을 입력해주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setRecommendations([]);

    try {
      const res = await fetch("/api/program-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(condition),
      });
      const data = await readApiJson<{ recommendations?: SongRecommendation[] }>(res);
      setRecommendations(data.recommendations ?? []);
      setSelectedRowId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "선곡 추천 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const applyExample = (exampleData: Omit<ProgramCondition, never>) => {
    setCondition(exampleData);
    setRecommendations([]);
    setError("");
    setSelectedRowId(null);
  };

  return (
    <section className="text-zinc-200">
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="self-center text-xs text-zinc-500">예시:</span>
        {EXAMPLE_PROGRAMS.map((ex) => (
          <button
            key={ex.label}
            onClick={() => applyExample(ex.data)}
            className="rounded-full border border-zinc-600 px-3 py-1 text-xs text-zinc-300 transition-colors hover:border-[#4764e6] hover:text-white"
          >
            {ex.label}
          </button>
        ))}
      </div>

      {/* 프로그램 조건 입력 폼 */}
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <InputField
          label="프로그램명 *"
          placeholder="예: 아침 뉴스 오프닝 특집"
          value={condition.programName}
          onChange={(v) => updateField("programName", v)}
        />
        <InputField
          label="시간대"
          placeholder="예: 오전 7시 뉴스"
          value={condition.timeSlot}
          onChange={(v) => updateField("timeSlot", v)}
        />
        <InputField
          label="분위기"
          placeholder="예: 차분하고 신뢰감 있는"
          value={condition.mood}
          onChange={(v) => updateField("mood", v)}
        />
        <InputField
          label="청취자층"
          placeholder="예: 30~50대 직장인"
          value={condition.audience}
          onChange={(v) => updateField("audience", v)}
        />
        <InputField
          label="진행 스타일"
          placeholder="예: 뉴스 리포트 중심"
          value={condition.style}
          onChange={(v) => updateField("style", v)}
        />
        <div>
          <label className="mb-1 block text-xs font-semibold text-zinc-400">
            필요 곡 수
          </label>
          <select
            value={Math.min(7, Math.max(3, condition.songCount))}
            onChange={(e) => updateField("songCount", Number(e.target.value))}
            className="w-full rounded border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-[#4764e6]"
          >
            {[3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n}곡
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 생성 버튼 */}
      <button
        onClick={handleRecommend}
        disabled={loading}
        className="mb-4 w-full rounded bg-[#4764e6] py-2.5 font-bold text-white transition-colors hover:bg-[#5a75ea] disabled:opacity-50"
      >
        {loading ? "처리 중..." : "선곡안 생성"}
      </button>

      {error && (
        <div className="mb-4 rounded border border-red-800/80 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          <span className="font-semibold">오류:</span> {error}
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-zinc-500">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#4764e6] border-t-transparent" />
          <p className="text-sm font-semibold text-zinc-300">AI 선곡 후 YouTube 매칭 중…</p>
        </div>
      )}

      {/* 추천 결과 목록 */}
      {!loading && recommendations.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                총 재생시간
              </p>
              <p className="text-2xl font-bold tabular-nums tracking-tight text-white">
                {totalLabel}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                프로그램 길이
              </p>
              <p className="text-lg font-semibold tabular-nums text-zinc-200">
                {totalLabel}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                슬롯 {recommendations.length}개 · 주요 곡 기준 연속 편성
              </p>
            </div>
          </div>

          {recommendations.map((rec) => {
            const tableRows = rowsBySlot.get(rec.order) ?? [];
            return (
              <div
                key={rec.order}
                className="overflow-hidden rounded-xl border border-zinc-700/90 shadow-lg shadow-black/20"
              >
                <div className="flex items-center gap-3 bg-[#4764e6] px-4 py-2.5 text-white">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/25 text-xs font-black">
                    {rec.order}
                  </span>
                  <span className="truncate text-sm font-semibold">{rec.title}</span>
                  <span
                    className={`ml-auto shrink-0 rounded border px-2 py-0.5 text-xs ${
                      ROLE_COLORS[rec.role] ?? ROLE_COLORS["일반"]
                    }`}
                  >
                    {rec.role}
                  </span>
                </div>

                <div className="bg-zinc-900/40 p-3 sm:p-4">
                  <div className="mb-3 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                    <p className="text-zinc-300">
                      <span className="font-semibold text-zinc-100">슬롯 기획:</span>{" "}
                      {rec.reason}
                    </p>
                    <p className="text-zinc-500">
                      <span className="font-semibold text-zinc-400">분위기:</span> {rec.mood}
                    </p>
                  </div>

                  {tableRows.length > 0 ? (
                    <RadioTrackTable
                      rows={tableRows}
                      selectedId={selectedRowId}
                      onSelect={setSelectedRowId}
                      onPlay={setPlaying}
                    />
                  ) : (
                    <p className="text-xs italic text-zinc-600">
                      AI 선곡·영상 매칭 결과 없음
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 빈 상태 */}
      {!loading && recommendations.length === 0 && !error && (
        <div className="py-12 text-center text-sm text-zinc-500">
          <p className="mb-3 text-4xl">📻</p>
          <p>조건을 입력한 뒤 선곡안을 생성하세요</p>
        </div>
      )}

      {/* YouTube 재생 모달 */}
      <YouTubePlayerModal video={playing} onClose={() => setPlaying(null)} />
    </section>
  );
}

// 입력 필드 재사용 컴포넌트
function InputField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-zinc-400">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#4764e6] focus:ring-1 focus:ring-[#4764e6]"
      />
    </div>
  );
}
