// ======================================================
// Vercel Cron: chungmu-audio/* Blob 중 업로드 시점 기준 2일 초과분 삭제
// GET /api/cron/cleanup-blob (vercel.json에서 스케줄 등록)
// 보안: Authorization: Bearer <CRON_SECRET> (Vercel Cron이 자동 전송)
// ======================================================

import { del, list } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

const AUDIO_PREFIX = "chungmu-audio/";
/** 업로드 후 유지 기간 — 이 시간이 지난 Blob만 삭제 */
const RETENTION_MS = 2 * 24 * 60 * 60 * 1000;
const LIST_PAGE = 1000;
const DEL_CHUNK = 100;

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json(
      { ok: false, error: "BLOB_READ_WRITE_TOKEN이 없어 Blob을 정리할 수 없습니다." },
      { status: 503 }
    );
  }

  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "CRON_SECRET이 설정되지 않았습니다. Vercel 환경 변수에 CRON_SECRET을 추가한 뒤 Cron에서 전달되도록 하세요.",
      },
      { status: 503 }
    );
  }

  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = Date.now() - RETENTION_MS;
  let cursor: string | undefined;
  let totalExamined = 0;
  let totalDeleted = 0;

  try {
    do {
      const { blobs, hasMore, cursor: next } = await list({
        prefix: AUDIO_PREFIX,
        limit: LIST_PAGE,
        cursor,
      });

      totalExamined += blobs.length;
      const stale = blobs.filter((b) => b.uploadedAt.getTime() < cutoff);

      if (stale.length > 0) {
        const pathnames = stale.map((b) => b.pathname);
        for (let i = 0; i < pathnames.length; i += DEL_CHUNK) {
          const chunk = pathnames.slice(i, i + DEL_CHUNK);
          await del(chunk);
        }
        totalDeleted += stale.length;
      }

      cursor = hasMore && next ? next : undefined;
    } while (cursor);

    return NextResponse.json({
      ok: true,
      prefix: AUDIO_PREFIX,
      retentionDays: 2,
      examined: totalExamined,
      deleted: totalDeleted,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Blob 정리 실패";
    console.error("[cleanup-blob]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
