"use client";

// ======================================================
// 라디오 선곡 — 검색·매칭 결과 테이블 (시작/종료/길이 컬럼)
// ======================================================

import Image from "next/image";
import type { YouTubeVideo } from "@/types";

export interface RadioTrackRowModel {
  id: string;
  displayIndex: number;
  video: YouTubeVideo | null;
  title: string;
  artist: string;
  lengthLabel: string;
  startClock: string | null;
  endClock: string | null;
  infoText?: string;
  matchError?: string;
  /** 후보 곡 등 — 타임라인에 포함되지 않는 행 */
  isAlternate?: boolean;
}

interface Props {
  rows: RadioTrackRowModel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPlay: (video: YouTubeVideo) => void;
}

export default function RadioTrackTable({ rows, selectedId, onSelect, onPlay }: Props) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-6 text-center text-xs text-zinc-500">
        표시할 곡이 없습니다.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-950/40">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            <th className="px-3 py-2.5 pl-4 font-medium">시작 시간</th>
            <th className="px-3 py-2.5 font-medium">곡 정보</th>
            <th className="w-20 px-3 py-2.5 font-medium">길이</th>
            <th className="px-3 py-2.5 font-medium">종료 시간</th>
            <th className="w-28 px-3 py-2.5 pr-4 text-right font-medium"> </th>
          </tr>
        </thead>
        <tbody className="text-zinc-200">
          {rows.map((row) => {
            const playable = Boolean(row.video);
            const selected = selectedId === row.id;
            const thumb =
              row.video?.thumbnail || "https://i.ytimg.com/vi/default/mqdefault.jpg";
            const timeOrDash = (v: string | null) => v ?? "—";

            return (
              <tr
                key={row.id}
                onClick={() => onSelect(row.id)}
                className={`cursor-pointer border-b border-zinc-800/60 transition-colors last:border-b-0 ${
                  selected
                    ? "bg-[#1e3a5f]/35 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.65),0_0_16px_rgba(37,99,235,0.12)]"
                    : "hover:bg-zinc-900/50"
                }`}
              >
                <td className="align-middle px-3 py-2.5 pl-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-md bg-zinc-800 px-1.5 text-xs font-bold tabular-nums text-zinc-400">
                      {row.displayIndex}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-zinc-300">
                      {timeOrDash(row.startClock)}
                    </span>
                  </div>
                </td>
                <td className="max-w-0 align-middle px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-zinc-700">
                      <Image
                        src={thumb}
                        alt=""
                        width={48}
                        height={48}
                        className="h-full w-full object-cover"
                        unoptimized
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-zinc-100">{row.title}</p>
                      <p className="truncate text-xs text-zinc-500">{row.artist}</p>
                      {row.isAlternate && (
                        <p className="mt-0.5 text-[10px] font-medium text-amber-500/90">
                          대체 후보
                        </p>
                      )}
                      {row.matchError && (
                        <p className="mt-1 text-[11px] text-amber-400/90">{row.matchError}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="align-middle px-3 py-2.5 font-mono text-xs tabular-nums text-zinc-400">
                  {row.lengthLabel}
                </td>
                <td className="align-middle px-3 py-2.5 font-mono text-xs tabular-nums text-zinc-300">
                  {timeOrDash(row.endClock)}
                </td>
                <td className="align-middle px-3 py-2.5 pr-4 text-right">
                  <div
                    className="flex items-center justify-end gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {row.infoText && (
                      <span
                        className="inline-flex h-8 w-8 cursor-help items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                        title={row.infoText}
                        role="img"
                        aria-label="선곡 정보"
                      >
                        <InfoIcon />
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={!playable}
                      onClick={() => row.video && onPlay(row.video)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#7c94f0] transition-colors hover:bg-[#4764e6]/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label="미리듣기"
                      title="재생"
                    >
                      <PlayIcon />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path
        fill="currentColor"
        d="M11 10h2v8h-2v-8zm0-4h2v2h-2V6z"
        className="text-current"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7L8 5z" />
    </svg>
  );
}
