// ======================================================
// Blob 연결·응답 경로 점검 (개발/운영, 직접 GET 호출)
// - 토큰으로 list가 되면 "이 토큰이 가리키는 스토어"는 최소 read 가능
// - chungmu-audio/ prefix에 객체가 있으면 generate-music put도 같은 스토어에 쌓인 것
// 인증: Authorization: Bearer <CRON_SECRET> (cleanup-blob과 동일)
// ======================================================

import { list } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

const PREFIX = "chungmu-audio/";

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized (CRON_SECRET Bearer 필요)" },
      { status: 401 }
    );
  }

  const hasToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());

  if (!hasToken) {
    return NextResponse.json({
      ok: true,
      tokenConfigured: false,
      hint: "BLOB_READ_WRITE_TOKEN 없음 → generate-music는 항상 audioBase64 폴백",
      firstPageBlobs: 0,
    });
  }

  try {
    const { blobs, hasMore } = await list({
      prefix: PREFIX,
      limit: 20,
    });

    return NextResponse.json({
      ok: true,
      tokenConfigured: true,
      listReachable: true,
      prefix: PREFIX,
      firstPageBlobs: blobs.length,
      hasMore,
      samplePathnames: blobs.slice(0, 5).map((b) => b.pathname),
      totalBytesThisPage: blobs.reduce((s, b) => s + b.size, 0),
      message:
        blobs.length > 0
          ? "이 토큰의 스토어에 chungmu-audio 객체가 있습니다. 대시보드 0B면 다른 스토어를 보고 있을 수 있음."
          : "list는 성공했으나 chungmu-audio/에 아무 것도 없음. 최근 응답이 audioBase64-only이면 put이 실패한 것(서버 로그에서 Blob 실패 경고 확인).",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[blob-diagnostics] list 실패:", message);
    return NextResponse.json(
      {
        ok: false,
        tokenConfigured: true,
        listReachable: false,
        listError: message,
        hint: "토큰이 잘못됐거나 만료, 또는 다른 팀/스토어 토큰일 수 있음",
      },
      { status: 200 }
    );
  }
}
