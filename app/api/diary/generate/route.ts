import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { callDiaryGenerate, calcCostForAI, type DiaryMessage } from "@/lib/ai";

/**
 * POST /api/diary/generate
 * 生成 400 字日记文章
 * - 获取完整对话历史
 * - 调用 AI 生成 400 字日记
 * - 更新 Diary.summaryMd 和 status = GENERATED
 * - 记录 AIReview
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
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!diary) {
      return NextResponse.json({ ok: false, error: "日记不存在" }, { status: 404 });
    }

    if (diary.messages.length === 0) {
      return NextResponse.json({ ok: false, error: "对话历史为空，无法生成日记" }, { status: 400 });
    }

    // 构建对话历史
    const messagesForAI: DiaryMessage[] = diary.messages.map((m) => ({
      role: m.role as "USER" | "ASSISTANT",
      content: m.content,
    }));

    // 调用 AI 生成日记（传递日记日期）
    let generatedContent: string;
    let aiReviewId: string | null = null;

    try {
      const aiResult = await callDiaryGenerate(messagesForAI, diary.diaryDate);
      generatedContent = aiResult.content;

      // 记录 AI 调用
      const aiReview = await prisma.aIReview.create({
        data: {
          diaryId: diary.id,
          kind: "DIARY_SUMMARY",
          model: aiResult.model,
          prompt: aiResult.prompt,
          inputHash: aiResult.inputHash,
          ok: true,
          outputJson: { content: aiResult.content },
          rawText: aiResult.rawText,
          tokenUsage: aiResult.usage.total_tokens ?? 0,
          cost: await calcCostForAI(aiResult.usage),
        },
      });
      aiReviewId = aiReview.id;
    } catch (error) {
      console.error("AI 日记生成失败", error);
      return NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "AI 日记生成失败",
        },
        { status: 500 }
      );
    }

    // 更新日记
    const updatedDiary = await prisma.diary.update({
      where: { id: diaryId },
      data: {
        summaryMd: generatedContent,
        status: "GENERATED",
      },
    });

    // 清除相关页面缓存
    revalidatePath("/admin/diary");
    revalidatePath(`/admin/diary/${diaryId}`);

    return NextResponse.json({
      ok: true,
      data: {
        diary: updatedDiary,
        aiReviewId,
      },
    });
  } catch (error) {
    console.error("生成日记失败", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "生成日记失败",
      },
      { status: 500 }
    );
  }
}

