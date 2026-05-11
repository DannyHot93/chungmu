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
  const [loaded, setLoaded] = useState(false);
  const [embedTimedOut, setEmbedTimedOut] = useState(false);
  const [useNoCookie, setUseNoCookie] = useState(false);

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

  useEffect(() => {
    setLoaded(false);
    setEmbedTimedOut(false);
    setUseNoCookie(false);
  }, [videoId]);

  useEffect(() => {
    if (!videoId || loaded) return;
    const timer = window.setTimeout(() => {
      setEmbedTimedOut(true);
    }, 4_000);
    return () => window.clearTimeout(timer);
  }, [loaded, videoId, useNoCookie]);

  const embedSrc = useMemo(() => {
    if (!videoId) return "";
    const p = new URLSearchParams({
      autoplay: "1",
      rel: "0",
      playsinline: "1",
      modestbranding: "1",
    });
    if (origin) p.set("origin", origin);
    const host = useNoCookie ? "www.youtube-nocookie.com" : "www.youtube.com";
    return `https://${host}/embed/${videoId}?${p.toString()}`;
  }, [videoId, origin, useNoCookie]);

  if (!video) return null;

  const openInNewTab = () => {
    if (!watchUrl) return;
    const opened = window.open(watchUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      window.location.href = watchUrl;
    }
  };

  const openInCurrentTab = () => {
    if (!watchUrl) return;
    window.location.href = watchUrl;
  };

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
            <>
              {!loaded && (
                <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center bg-zinc-950 text-sm text-zinc-400">
                  재생 화면 로딩 중...
                </div>
              )}
              <iframe
                key={`${videoId}-${useNoCookie ? "nocookie" : "youtube"}`}
                src={embedSrc}
                className="absolute inset-0 z-10 h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                allowFullScreen
                loading="eager"
                title={video.title}
                referrerPolicy="strict-origin-when-cross-origin"
                onLoad={() => {
                  setLoaded(true);
                  setEmbedTimedOut(false);
                }}
              />
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 text-sm text-zinc-400">
              잘못된 영상 ID입니다.
            </div>
          )}
        </div>

        <div className="relative z-20 bg-gray-900 p-3 text-white">
          <p className="truncate text-sm font-bold">{video.title}</p>
          <p className="text-xs text-gray-400">{video.channelTitle}</p>
          {embedTimedOut && (
            <p className="mt-2 text-xs text-amber-300">
              내장 재생이 브라우저나 영상 설정 때문에 막혔을 수 있습니다. 아래 버튼으로 YouTube에서 열어 주세요.
            </p>
          )}
          {watchUrl && (
            <div
              className="mt-2 flex flex-wrap items-center gap-2 text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={openInNewTab}
                className="rounded border border-[#4764e6]/60 px-2 py-1 font-medium text-[#9aacff] transition-colors hover:border-white hover:text-white"
              >
                YouTube 새 탭에서 열기
              </button>
              <button
                type="button"
                onClick={openInCurrentTab}
                className="rounded border border-[#4764e6]/60 px-2 py-1 font-medium text-[#9aacff] transition-colors hover:border-white hover:text-white"
              >
                현재 탭에서 열기
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoaded(false);
                  setEmbedTimedOut(false);
                  setUseNoCookie((v) => !v);
                }}
                className="rounded border border-zinc-600 px-2 py-1 font-medium text-zinc-300 transition-colors hover:border-white hover:text-white"
              >
                다른 플레이어로 다시 시도
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
