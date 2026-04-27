"use client";

// ======================================================
// 세그먼트 오류 시 표시 (서버 500 HTML 대신 React 쪽 예외용)
// ======================================================

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center text-zinc-200">
      <p className="mb-2 text-lg font-bold text-red-300">화면을 불러오는 중 문제가 발생했습니다</p>
      <p className="mb-6 break-all text-sm text-zinc-500">{error.message}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded bg-[#4764e6] px-5 py-2 text-sm font-semibold text-white hover:bg-[#5a75ea]"
      >
        다시 시도
      </button>
    </div>
  );
}
