import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { DiaryStatus, DiaryMessageRole, AIReviewKind } from "@prisma/client";
import { callDiaryStart, calcCostForAI } from "@/lib/ai";

/**
 * POST /api/diary/[id]/clear
 * 清空日记对话历史（保留日记记录，删除所有消息，并重新生成 AI 开场白）
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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

    // 只有对话中或已生成的日记才能清空对话
    if (diary.status === DiaryStatus.PUBLISHED) {
      return NextResponse.json({ ok: false, error: "已发布的日记不能清空对话" }, { status: 400 });
    }

    // 删除所有对话消息
    await prisma.diaryMessage.deleteMany({
      where: { diaryId: id },
    });

    // 重置日记状态
    const updatedDiary = await prisma.diary.update({
      where: { id },
      data: {
        status: DiaryStatus.CHATTING,
        summaryMd: null,
        publishedAt: null,
        updatedAt: new Date(),
      },
    });

    // 重新生成 AI 开场白
    let aiGreeting: string;
    let aiPrompt: string | undefined;
    let aiUsage;
    let aiRawText: string | undefined;

    try {
      const aiResult = await callDiaryStart();
      aiGreeting = aiResult.content;
      aiPrompt = aiResult.prompt;
      aiUsage = aiResult.usage;
      aiRawText = aiResult.rawText;

      // 记录 AI 调用
      await prisma.aIReview.create({
        data: {
          diaryId: updatedDiary.id,
          kind: AIReviewKind.DIARY_CHAT,
          model: aiResult.model,
          prompt: aiPrompt,
          inputHash: aiResult.inputHash,
          ok: true,
          outputJson: { content: aiGreeting },
          rawText: aiRawText,
          tokenUsage: aiUsage.total_tokens ?? 0,
          cost: await calcCostForAI(aiUsage),
        },
      });
    } catch (error) {
      console.error("AI 开场白生成失败", error);
      // 降级：使用默认开场白
      aiGreeting = "嗨！今天过得怎么样？有什么想和我分享的吗？";
    }

    // 存储开场白消息
    await prisma.diaryMessage.create({
      data: {
        diaryId: updatedDiary.id,
        role: DiaryMessageRole.ASSISTANT,
        content: aiGreeting,
      },
    });

    // 返回更新后的日记，包含新的开场白
    const diaryWithMessages = await prisma.diary.findUnique({
      where: { id: updatedDiary.id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    // 清除相关页面缓存
    revalidatePath("/admin/diary");
    revalidatePath(`/admin/diary/${id}`);
    revalidatePath(`/admin/diary/${id}/chat`);

    return NextResponse.json({
      ok: true,
      data: { diary: diaryWithMessages },
    });
  } catch (error) {
    console.error("清空对话失败", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "清空对话失败",
      },
      { status: 500 }
    );
  }
}

