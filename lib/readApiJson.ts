// ======================================================
// 클라이언트: API 응답을 text → JSON으로 안전히 파싱
// (500 시 HTML "Internal Server Error" 등으로 res.json()이 깨지는 것 방지)
// ======================================================

/**
 * `await res.text()` 뒤 JSON 파싱. 실패 시 의미 있는 Error를 던집니다.
 * `!res.ok`이면 본문의 `error` 문자열을 우선 사용합니다.
 */
export async function readApiJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  let data: unknown = {};

  if (trimmed) {
    try {
      data = JSON.parse(trimmed);
    } catch {
      const snippet = trimmed.slice(0, 200).replace(/\s+/g, " ");
      throw new Error(
        res.ok
          ? "서버 응답이 올바른 JSON이 아닙니다."
          : `서버 오류 (${res.status})${snippet ? `: ${snippet}` : ""}`
      );
    }
  }

  if (!res.ok) {
    const errObj = data as { error?: unknown };
    const msg =
      typeof errObj.error === "string" && errObj.error.trim()
        ? errObj.error
        : `요청 실패 (${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}
