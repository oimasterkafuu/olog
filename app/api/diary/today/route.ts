import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getDiaryDate } from "@/lib/diary-date";

/**
 * GET /api/diary/today
 * 获取今天的日记
 * - 基于 30 小时制计算今天的日记日期
 * - 返回 Diary 记录及所有 DiaryMessage（按时间排序）
 * - 若不存在返回 404
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
    }

    const diaryDate = getDiaryDate();

    const diary = await prisma.diary.findUnique({
      where: { diaryDate },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!diary) {
      return NextResponse.json({ ok: false, error: "今天还没有开始写日记" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      data: { diary },
    });
  } catch (error) {
    console.error("获取今日日记失败", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "获取今日日记失败",
      },
      { status: 500 }
    );
  }
}

