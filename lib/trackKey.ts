// ======================================================
// 동일 곡(다른 영상)·표기 차이 중복 제거용 키
// ======================================================

/** 공백·대소문자·흔한 접미어를 정규화한 "가수|제목" 키 */
export function normalizeTrackKey(artist: string, title: string): string {
  const strip = (s: string) => {
    let t = s
      .toLowerCase()
      .normalize("NFKC")
      .replace(/\s*[\[(].*?[\])]\s*/g, " ")
      .replace(/\b(official|audio|mv|ver\.?|version|lyrics|video|한국어|kor\.?)\b/gi, " ")
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    return t;
  };
  return `${strip(artist)}|${strip(title)}`;
}

/** YouTube snippet.publishedAt (업로드 시점) → 연도 */
export function yearFromPublishedAt(iso: string | undefined): number | null {
  if (!iso || iso.length < 4) return null;
  const y = Number.parseInt(iso.slice(0, 4), 10);
  return Number.isFinite(y) && y >= 1990 && y <= new Date().getFullYear() + 1 ? y : null;
}
