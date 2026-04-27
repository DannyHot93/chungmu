"use client";

// ======================================================
// 음악 검색 결과 행 — AI 선정 곡명 + YouTube 재생
// ======================================================

import Image from "next/image";
import { parseDuration } from "@/lib/youtube";
import type { YouTubeVideo } from "@/types";

interface Props {
  video: YouTubeVideo | null;
  index: number;
  onPlay: (video: YouTubeVideo) => void;
  tag?: string;
  /** AI 선정: "아티스트 - 곡제목" */
  songLine?: string;
  reason?: string;
  matchError?: string;
}

export default function MusicListRow({
  video,
  index,
  onPlay,
  tag,
  songLine,
  reason,
  matchError,
}: Props) {
  const playable = Boolean(video);
  const thumb = video?.thumbnail || "https://i.ytimg.com/vi/default/mqdefault.jpg";
  const durationLabel = video ? parseDuration(video.duration) : "—";

  return (
    <li className="flex items-center gap-3 rounded border border-zinc-700 bg-zinc-900/60 p-2 transition-colors hover:bg-zinc-800/80 sm:p-3">
      <span className="hidden w-7 shrink-0 text-center text-xs font-bold tabular-nums text-[#7c94f0] sm:inline">
        {index}
      </span>

      <button
        type="button"
        onClick={() => video && onPlay(video)}
        disabled={!playable}
        className="relative aspect-video w-24 shrink-0 overflow-hidden rounded ring-1 ring-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#4764e6] disabled:cursor-not-allowed disabled:opacity-50 sm:w-28"
        aria-label={video ? `${video.title} 재생` : "영상 없음"}
      >
        <Image
          src={thumb}
          alt=""
          width={112}
          height={63}
          className="h-full w-full object-cover"
          unoptimized
        />
        {playable && (
          <>
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 transition-colors hover:bg-black/50">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#4764e6] text-sm text-white shadow">
                ▶
              </span>
            </span>
            <span className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 text-[10px] text-white">
              {durationLabel}
            </span>
          </>
        )}
      </button>

      <div className="min-w-0 flex-1 py-0.5">
        {tag && (
          <span className="mb-0.5 inline-block rounded border border-[#4764e6]/40 bg-[#4764e6]/15 px-1.5 py-0 text-[10px] text-[#7c94f0]">
            {tag}
          </span>
        )}
        {songLine && (
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-100">{songLine}</p>
        )}
        {reason && (
          <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{reason}</p>
        )}
        {video && (
          <p className={`mt-0.5 line-clamp-2 text-sm leading-snug ${songLine ? "text-zinc-400" : "font-semibold text-zinc-100"}`}>
            {video.title}
          </p>
        )}
        {video && (
          <p className="mt-0.5 truncate text-xs text-zinc-500">{video.channelTitle}</p>
        )}
        {video?.description && !songLine && (
          <p className="mt-0.5 hidden line-clamp-1 text-xs text-zinc-600 sm:block">
            {video.description}
          </p>
        )}
        {matchError && (
          <p className="mt-1 text-xs text-amber-400/90">{matchError}</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => video && onPlay(video)}
        disabled={!playable}
        className="shrink-0 whitespace-nowrap rounded bg-[#4764e6] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[#5a75ea] disabled:cursor-not-allowed disabled:opacity-40"
      >
        재생
      </button>
    </li>
  );
}
