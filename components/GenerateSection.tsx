"use client";

// ======================================================
// AI 음악 생성: 짧은 클립 / 긴·고퀄
// ======================================================

import { useState, useRef, useEffect, useCallback } from "react";
import { readApiJson } from "@/lib/readApiJson";
import type { VocalMode } from "@/types";

type LyricsLanguage = "ko" | "en";

const DEFAULT_KO_PLACEHOLDER = `[Verse]
오늘도 조용히 빛나는 하루
바람에 실려 온 작은 마음

[Chorus]
지금 이 순간 너에게 닿아
우리의 노래가 시작돼`;

const DEFAULT_EN_PLACEHOLDER = `[Verse]
Walking through the morning light
Every step feels new and right

[Chorus]
This is our song, forever strong
Carrying us where we belong`;

type Mode = "short" | "long";

type GeneratedTrack = {
  id: string;
  audioUrl: string;
  audioMimeType: string;
  promptUsed: string;
  koreanInput: string;
  usedRetryPrompt: boolean;
  generatedModel: "lyria2" | "lyria3pro";
  resultVocalMode: VocalMode;
  isBlobUrl: boolean;
};

const EXAMPLE_KEYWORDS = [
  "차분하고 잔잔한 배경",
  "몽환적인 새벽 분위기",
  "부드러운 희망 느낌",
  "가벼운 리듬과 따뜻한 패드",
  "서서히 올라가는 긴장감",
];

/**
 * API 진행률 미제공 → 체감 진행률.
 * 짧은 음악은 tau를 짧게 해 초반에 막대가 더 빨리 움직이게 함(대기 체감 완화).
 */
function estimateProgressPercent(
  startedAt: number,
  mode: Mode,
  maxBeforeDone = 98
): number {
  const elapsed = Date.now() - startedAt;
  const isLong = mode === "long";
  const tau = isLong ? 88_000 : 8_500;
  const tau2 = tau * 3.5;
  const base =
    70 * (1 - Math.exp(-elapsed / tau)) +
    24 * (1 - Math.exp(-elapsed / tau2));
  const crawlStart = isLong ? 40_000 : 12_000;
  const crawlCap = isLong ? 8 : 10;
  const crawlRate = isLong ? 0.00005 : 0.00009;
  const crawl = Math.min(crawlCap, Math.max(0, elapsed - crawlStart) * crawlRate);
  return Math.min(maxBeforeDone, base + crawl);
}

function extensionForMime(mime: string | undefined): string {
  if (!mime) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  return "audio";
}

export default function GenerateSection() {
  const [keyword, setKeyword] = useState("");
  const [mode, setMode] = useState<Mode>("short");
  const [vocalMode, setVocalMode] = useState<VocalMode>("instrumental");
  const [lyrics, setLyrics] = useState("");
  const [lyricsLanguage, setLyricsLanguage] = useState<LyricsLanguage>("ko");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generatedTracks, setGeneratedTracks] = useState<GeneratedTrack[]>([]);
  const [progressPercent, setProgressPercent] = useState(0);

  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadStartedAtRef = useRef<number>(0);
  const modeRef = useRef<Mode>("short");
  const blobUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // 진행률 시각: 반드시 handleGenerate에서 loadStartedAtRef를 먼저 찍는다.
  // (React 18 Strict Mode로 이 effect가 두 번 돌 때, 여기서 시각/0%를 다시 잡으면 막대가 0%로 돌아가
  //  "진행이 안 된다"처럼 보이는 원인이 됨)
  useEffect(() => {
    if (!loading) return;

    const tick = () => {
      if (document.visibilityState === "hidden") return;
      setProgressPercent(
        estimateProgressPercent(loadStartedAtRef.current, modeRef.current)
      );
    };

    tick();
    progressTimerRef.current = setInterval(tick, 200);

    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, [loading]);

  const stopProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const clearProgressResetTimer = useCallback(() => {
    if (progressResetTimerRef.current) {
      clearTimeout(progressResetTimerRef.current);
      progressResetTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopProgressTimer();
      clearProgressResetTimer();
    };
  }, [clearProgressResetTimer, stopProgressTimer]);

  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current = [];
    };
  }, []);

  const handleGenerate = async () => {
    if (!keyword.trim()) return;

    clearProgressResetTimer();
    setError("");
    loadStartedAtRef.current = Date.now();
    setLoading(true);
    setProgressPercent(0);

    const clientAbortMs = 4 * 60 * 1000;
    const ac = new AbortController();
    const abortTimer = setTimeout(() => ac.abort(), clientAbortMs);

    try {
      const res = await fetch("/api/generate-music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: keyword.trim(),
          mode: mode === "long" ? "long" : "short",
          vocalMode,
          lyrics: lyrics.trim(),
          lyricsLanguage,
        }),
        signal: ac.signal,
      });
      const data = await readApiJson<{
        audioUrl?: string;        // Blob URL (서버에서 업로드 성공 시)
        audioBase64?: string;     // Base64 폴백 (BLOB_READ_WRITE_TOKEN 없을 때)
        audioMimeType?: string;
        promptUsed: string;
        koreanInput: string;
        usedRetryPrompt?: boolean;
        model?: string;
        vocalMode?: VocalMode;
      }>(res);

      stopProgressTimer();
      setProgressPercent(100);

      const mime = (data.audioMimeType as string) || "audio/wav";
      let url: string;
      let isObjUrl = false;

      if (data.audioUrl) {
        // Vercel Blob URL — revokeObjectURL 불필요
        url = data.audioUrl;
      } else if (data.audioBase64) {
        // Base64 폴백 → ObjectURL 생성
        const binaryStr = atob(data.audioBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mime });
        url = URL.createObjectURL(blob);
        isObjUrl = true;
        blobUrlsRef.current.push(url);
      } else {
        throw new Error("서버에서 오디오 데이터가 반환되지 않았습니다.");
      }

      const track: GeneratedTrack = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        audioUrl: url,
        audioMimeType: mime,
        promptUsed: data.promptUsed,
        koreanInput: data.koreanInput,
        usedRetryPrompt: Boolean(data.usedRetryPrompt),
        generatedModel: data.model === "lyria3pro" ? "lyria3pro" : "lyria2",
        resultVocalMode:
          data.vocalMode === "vocals" || data.vocalMode === "instrumental"
            ? data.vocalMode
            : vocalMode,
        isBlobUrl: isObjUrl,
      };

      setGeneratedTracks((prev) => [track, ...prev]);
    } catch (err: unknown) {
      stopProgressTimer();
      setProgressPercent(0);
      if (err instanceof Error && err.name === "AbortError") {
        setError(
          "요청이 4분 안에 끝나지 않았습니다. 배포 환경(Vercel 등)의 함수 실행 시간 제한·네트워크를 확인하세요."
        );
      } else {
        setError(err instanceof Error ? err.message : "음악 생성 중 오류가 발생했습니다.");
      }
    } finally {
      clearTimeout(abortTimer);
      setLoading(false);
      clearProgressResetTimer();
      progressResetTimerRef.current = setTimeout(() => setProgressPercent(0), 600);
    }
  };

  const handleKeywordClick = (kw: string) => {
    setKeyword(kw);
  };

  const handleDownload = (track: GeneratedTrack) => {
    const ext = extensionForMime(track.audioMimeType);
    const a = document.createElement("a");
    a.href = track.audioUrl;
    a.download = `chungmu_${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const barWidth = `${Math.round(Math.min(100, progressPercent))}%`;

  return (
    <section className="text-zinc-200">
      {/* 생성 모드: 짧은 음악 / 긴·고퀄 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <span className="text-xs font-semibold text-zinc-400 shrink-0">생성 모드</span>
        <div className="flex rounded-lg overflow-hidden border border-zinc-600 bg-zinc-900/80 p-0.5">
          <button
            type="button"
            onClick={() => setMode("short")}
            disabled={loading}
            className={`flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-md transition-colors ${
              mode === "short"
                ? "bg-[#4764e6] text-white shadow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            짧은 음악 (~30초)
          </button>
          <button
            type="button"
            onClick={() => setMode("long")}
            disabled={loading}
            className={`flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-md transition-colors ${
              mode === "long"
                ? "bg-[#4764e6] text-white shadow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            긴·고퀄
          </button>
        </div>
      </div>

      {/* 보컬: 긍정 프롬프트만 사용 (제거/부정 문구 없음) */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-4">
        <span className="pt-2 text-xs font-semibold text-zinc-400 shrink-0">믹스</span>
        <div className="flex flex-col gap-2">
          <div className="flex rounded-lg overflow-hidden border border-zinc-600 bg-zinc-900/80 p-0.5">
            <button
              type="button"
              onClick={() => setVocalMode("instrumental")}
              disabled={loading}
              className={`flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-md transition-colors ${
                vocalMode === "instrumental"
                  ? "bg-[#4764e6] text-white shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              악기만
            </button>
            <button
              type="button"
              onClick={() => setVocalMode("vocals")}
              disabled={loading}
              className={`flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-md transition-colors ${
                vocalMode === "vocals"
                  ? "bg-[#4764e6] text-white shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              보컬 O
            </button>
          </div>
          {vocalMode === "vocals" && mode !== "long" && (
            <p className="text-[11px] text-amber-400/90">
              한국어 보컬은 <strong>긴·고퀄 (Lyria 3 Pro)</strong> 모드를 권장합니다.
            </p>
          )}
        </div>
      </div>

      {vocalMode === "vocals" && (
        <div className="mb-4 space-y-3">
          {/* 언어 선택 */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-xs font-semibold text-zinc-400 shrink-0">보컬 언어</span>
            <div className="flex rounded-lg overflow-hidden border border-zinc-600 bg-zinc-900/80 p-0.5">
              <button
                type="button"
                onClick={() => setLyricsLanguage("ko")}
                disabled={loading}
                className={`flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-md transition-colors ${
                  lyricsLanguage === "ko"
                    ? "bg-[#4764e6] text-white shadow"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                한국어 보컬
              </button>
              <button
                type="button"
                onClick={() => setLyricsLanguage("en")}
                disabled={loading}
                className={`flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-md transition-colors ${
                  lyricsLanguage === "en"
                    ? "bg-[#4764e6] text-white shadow"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                영어 보컬
              </button>
            </div>
          </div>

          {/* 가사 입력 */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-zinc-400">
              {lyricsLanguage === "ko" ? "한국어 가사" : "English Lyrics"}{" "}
              <span className="font-normal text-zinc-500">(비워두면 기본 가사 자동 적용)</span>
            </label>
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder={
                lyricsLanguage === "ko" ? DEFAULT_KO_PLACEHOLDER : DEFAULT_EN_PLACEHOLDER
              }
              disabled={loading}
              rows={7}
              className="min-h-36 w-full rounded border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#4764e6] focus:ring-1 focus:ring-[#4764e6] resize-y"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              {lyricsLanguage === "ko"
                ? "한국어 보컬을 원하면 가사를 직접 넣는 것이 가장 안정적입니다."
                : "For best results, provide English lyrics directly."}{" "}
              {mode !== "long" && (
                <span className="text-amber-400/80">짧은 클립 모드에서는 효과가 제한적입니다.</span>
              )}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          placeholder="분위기·감정 키워드"
          className="flex-1 rounded border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-[#4764e6] focus:ring-1 focus:ring-[#4764e6]"
          disabled={loading}
        />
        <button
          onClick={() => handleGenerate()}
          disabled={loading || !keyword.trim()}
          className="rounded bg-[#4764e6] px-5 py-2 text-sm font-bold text-white hover:bg-[#5a75ea] disabled:opacity-50 whitespace-nowrap transition-colors"
        >
          {loading ? "생성 중..." : "생성"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {EXAMPLE_KEYWORDS.map((kw) => (
          <button
            key={kw}
            onClick={() => handleKeywordClick(kw)}
            disabled={loading}
            className="rounded-full border border-zinc-600 px-3 py-1 text-xs text-zinc-300 hover:border-[#4764e6] hover:text-white disabled:opacity-40 transition-colors"
          >
            {kw}
          </button>
        ))}
      </div>

      {loading && (
        <div className="mb-4 rounded border border-zinc-600 bg-zinc-900/80 p-4">
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-[#4764e6]">
            <span>생성 중 · {mode === "short" ? "짧은 음악" : "긴·고퀄"}</span>
            <span className="tabular-nums">{Math.round(Math.min(100, progressPercent))}%</span>
          </div>
          <div
            className="h-3 w-full overflow-hidden rounded-full border border-zinc-600 bg-zinc-800"
            role="progressbar"
            aria-valuenow={Math.round(Math.min(100, progressPercent))}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#4764e6] to-[#7c94f0] transition-[width] duration-150 ease-out"
              style={{ width: barWidth }}
            />
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="mb-4 rounded border border-red-800/80 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          <span className="font-semibold">오류:</span> {error}
        </div>
      )}

      {generatedTracks.length > 0 && !loading && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-zinc-500">
            생성된 음악 {generatedTracks.length}개
          </p>
          <ol className="m-0 list-none space-y-3 p-0">
            {generatedTracks.map((track, index) => (
              <li
                key={track.id}
                className="space-y-3 rounded border border-zinc-600 bg-zinc-900/50 p-4"
              >
                {track.usedRetryPrompt && (
                  <div className="rounded border border-amber-800/80 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
                    첫 프롬프트가 정책으로 차단되어 중립 프롬프트로 재생성했습니다.
                  </div>
                )}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 text-xs text-zinc-400">
                    <p>
                      <span className="font-semibold text-zinc-200">입력:</span>{" "}
                      {track.koreanInput}
                    </p>
                    <p>
                      <span className="font-semibold text-zinc-200">생성 모드:</span>{" "}
                      {track.generatedModel === "lyria3pro"
                        ? "긴·고퀄"
                        : "짧은 음악 (~30초)"}
                    </p>
                    <p>
                      <span className="font-semibold text-zinc-200">믹스:</span>{" "}
                      {track.resultVocalMode === "vocals" ? "보컬 O" : "악기만"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-zinc-700 px-2 py-1 text-[11px] font-semibold text-zinc-400">
                    #{generatedTracks.length - index}
                  </span>
                </div>
                <div className="rounded border border-zinc-600 bg-black/30 p-2 text-xs text-zinc-400">
                  <code className="block break-all text-[#7c94f0]">{track.promptUsed}</code>
                </div>

                <audio controls src={track.audioUrl} className="w-full" autoPlay={index === 0} />

                <button
                  onClick={() => handleDownload(track)}
                  className="w-full rounded bg-emerald-700 py-2 text-sm font-semibold text-white hover:bg-emerald-600 transition-colors"
                >
                  다운로드 ({extensionForMime(track.audioMimeType).toUpperCase()})
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {generatedTracks.length === 0 && !loading && !error && (
        <div className="py-12 text-center text-sm text-zinc-500">
          <p className="mb-3 text-4xl">🎼</p>
          <p>키워드와 모드를 선택한 뒤 생성하세요</p>
        </div>
      )}
    </section>
  );
}
