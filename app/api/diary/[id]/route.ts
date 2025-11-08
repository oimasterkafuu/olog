import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * GET /api/diary/[id]
 * 获取指定日记（包括对话历史）
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
    }

    const { id } = params;

    const diary = await prisma.diary.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!diary) {
      return NextResponse.json({ ok: false, error: "日记不存在" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      data: { diary },
    });
  } catch (error) {
    console.error("获取日记失败", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "获取日记失败",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/diary/[id]
 * 编辑日记内容（仅允许编辑 summaryMd）
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json();
    const { summaryMd } = body;

    if (summaryMd !== undefined && (typeof summaryMd !== "string" || summaryMd.trim() === "")) {
      return NextResponse.json({ ok: false, error: "日记内容不能为空" }, { status: 400 });
    }

    // 检查日记是否存在
    const diary = await prisma.diary.findUnique({
      where: { id },
    });

    if (!diary) {
      return NextResponse.json({ ok: false, error: "日记不存在" }, { status: 404 });
    }

    // 更新日记内容
    const updatedDiary = await prisma.diary.update({
      where: { id },
      data: {
        summaryMd: summaryMd?.trim(),
      },
    });

    // 清除相关页面缓存
    revalidatePath("/admin/diary");
    revalidatePath(`/admin/diary/${id}`);

    return NextResponse.json({
      ok: true,
      data: { diary: updatedDiary },
    });
  } catch (error) {
    console.error("更新日记失败", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "更新日记失败",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/diary/[id]
 * 删除日记及关联的所有 DiaryMessage 和 AIReview
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
    }

    const { id } = params;

    // 检查日记是否存在
    const diary = await prisma.diary.findUnique({
      where: { id },
    });

    if (!diary) {
      return NextResponse.json({ ok: false, error: "日记不存在" }, { status: 404 });
    }

    // 删除日记（级联删除 messages 和 aiReviews）
    await prisma.diary.delete({
      where: { id },
    });

    // 清除相关页面缓存
    revalidatePath("/admin/diary");
    revalidatePath(`/admin/diary/${id}`);
    revalidatePath("/diary");

    return NextResponse.json({
      ok: true,
      data: { message: "日记已删除" },
    });
  } catch (error) {
    console.error("删除日记失败", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "删除日记失败",
      },
      { status: 500 }
    );
  }
}

