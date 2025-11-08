import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * POST /api/diary/publish
 * 发布日记
 * - 校验 summaryMd 存在
 * - 更新 status = PUBLISHED，publishedAt = now()
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
    }

    const body = await req.json();
    const { diaryId } = body;

    if (!diaryId || typeof diaryId !== "string") {
      return NextResponse.json({ ok: false, error: "缺少 diaryId" }, { status: 400 });
    }

    // 检查日记是否存在
    const diary = await prisma.diary.findUnique({
      where: { id: diaryId },
    });

    if (!diary) {
      return NextResponse.json({ ok: false, error: "日记不存在" }, { status: 404 });
    }

    if (!diary.summaryMd || diary.summaryMd.trim() === "") {
      return NextResponse.json({ ok: false, error: "日记内容为空，无法发布" }, { status: 400 });
    }

    // 更新为已发布状态
    const updatedDiary = await prisma.diary.update({
      where: { id: diaryId },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });

    // 清除相关页面缓存
    revalidatePath("/admin/diary");
    revalidatePath(`/admin/diary/${diaryId}`);
    revalidatePath("/diary");
    revalidatePath(`/diary/${diary.diaryDate}`);

    return NextResponse.json({
      ok: true,
      data: { diary: updatedDiary },
    });
  } catch (error) {
    console.error("发布日记失败", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "发布日记失败",
      },
      { status: 500 }
    );
  }
}

