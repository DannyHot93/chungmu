"use client";

// ======================================================
// YouTube 재생 모달
// — youtube-nocookie는 일부 환경에서 "동영상을 재생할 수 없음"이 잦아
//   표준 youtube.com/embed + origin·playsinline 권장
// ======================================================

import { useEffect, useMemo, useState } from "react";
import type { YouTubeVideo } from "@/types";

interface Props {
  video: YouTubeVideo | null;
  onClose: () => void;
}

function normalizeVideoId(raw: string): string {
  const t = raw.trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  const fromUrl = t.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/
  );
  return fromUrl?.[1] ?? t.replace(/[^\w-]/g, "").slice(0, 11);
}

export default function YouTubePlayerModal({ video, onClose }: Props) {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const videoId = video ? normalizeVideoId(video.id) : "";
  const watchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : "";

  const embedSrc = useMemo(() => {
    if (!videoId) return "";
    const p = new URLSearchParams({
      autoplay: "1",
      rel: "0",
      playsinline: "1",
      modestbranding: "1",
    });
    if (origin) p.set("origin", origin);
    return `https://www.youtube.com/embed/${videoId}?${p.toString()}`;
  }, [videoId, origin]);

  if (!video) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-lg bg-black shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-3 z-10 text-2xl font-bold text-white transition-colors hover:text-red-400"
          aria-label="닫기"
        >
          ✕
        </button>

        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
          {embedSrc ? (
            <iframe
              key={videoId}
              src={embedSrc}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
              allowFullScreen
              title={video.title}
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 text-sm text-zinc-400">
              잘못된 영상 ID입니다.
            </div>
          )}
        </div>

        <div className="bg-gray-900 p-3 text-white">
          <p className="truncate text-sm font-bold">{video.title}</p>
          <p className="text-xs text-gray-400">{video.channelTitle}</p>
          {watchUrl && (
            <p className="mt-2 text-xs">
              <a
                href={watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#7c94f0] underline-offset-2 hover:text-white hover:underline"
              >
                YouTube에서 열기 (재생이 안 될 때)
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
