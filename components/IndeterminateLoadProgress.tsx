"use client";

import { useEffect, useState, useRef } from "react";

function estimatePercent(startedAt: number, tau: number, max = 92): number {
  const elapsed = Date.now() - startedAt;
  return Math.min(max, (1 - Math.exp(-elapsed / tau)) * max);
}

type IndeterminateLoadProgressProps = {
  active: boolean;
  label: string;
  /** ms; 클수록 막대가 느리게 채워짐 (API에 진행률이 없을 때의 체감 표시) */
  tau?: number;
  className?: string;
};

/**
 * API 진행률 미제공 시 GenerateSection과 유사한 지수형 체감 진행률 막대
 */
export default function IndeterminateLoadProgress({
  active,
  label,
  tau = 45_000,
  className = "",
}: IndeterminateLoadProgressProps) {
  const [progressPercent, setProgressPercent] = useState(0);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!active) {
      setProgressPercent(0);
      return;
    }

    startedAtRef.current = Date.now();
    setProgressPercent(0);

    const tick = () => {
      if (document.visibilityState === "hidden") return;
      setProgressPercent(estimatePercent(startedAtRef.current, tau));
    };

    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [active, tau]);

  if (!active) return null;

  const p = Math.round(Math.min(100, progressPercent));
  const barWidth = `${p}%`;

  return (
    <div className={`rounded border border-zinc-600 bg-zinc-900/80 p-4 ${className}`}>
      <div className="mb-2 flex items-center justify-between text-xs font-medium text-[#4764e6]">
        <span>{label}</span>
        <span className="tabular-nums">{p}%</span>
      </div>
      <div
        className="h-3 w-full overflow-hidden rounded-full border border-zinc-600 bg-zinc-800"
        role="progressbar"
        aria-valuenow={p}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#4764e6] to-[#7c94f0] transition-[width] duration-150 ease-out"
          style={{ width: barWidth }}
        />
      </div>
    </div>
  );
}
