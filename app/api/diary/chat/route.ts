import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { callDiaryChat, calcCostForAI, type DiaryMessage } from "@/lib/ai";

/**
 * POST /api/diary/chat
 * 用户发送消息，AI 回复
 * - 存储用户消息
 * - 获取最近 20 条对话历史
 * - 调用 AI 生成回复
 * - 存储 AI 回复并记录 AIReview
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
    }

    const body = await req.json();
    const { diaryId, userMessage } = body;

    if (!diaryId || typeof diaryId !== "string") {
      return NextResponse.json({ ok: false, error: "缺少 diaryId" }, { status: 400 });
    }

    if (!userMessage || typeof userMessage !== "string" || !userMessage.trim()) {
      return NextResponse.json({ ok: false, error: "消息内容不能为空" }, { status: 400 });
    }

    // 检查日记是否存在
    const diary = await prisma.diary.findUnique({
      where: { id: diaryId },
      include: {
        messages: {
          select: { role: true },
        },
      },
    });

    if (!diary) {
      return NextResponse.json({ ok: false, error: "日记不存在" }, { status: 404 });
    }

    // 检查是否已达到20轮对话限制
    const userMessageCount = diary.messages.filter((m) => m.role === "USER").length;
    const maxRounds = 20;
    if (userMessageCount >= maxRounds) {
      return NextResponse.json(
        { ok: false, error: "已达到对话轮次上限（20轮），请生成日记或清空对话重新开始" },
        { status: 400 }
      );
    }

    // 存储用户消息
    const userMsg = await prisma.diaryMessage.create({
      data: {
        diaryId,
        role: "USER",
        content: userMessage.trim(),
      },
    });

    // 获取最近 20 条对话历史（包括刚存储的用户消息）
    const recentMessages = await prisma.diaryMessage.findMany({
      where: { diaryId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // 反转顺序（从旧到新）
    const messagesForAI: DiaryMessage[] = recentMessages
      .reverse()
      .map((m) => ({
        role: m.role as "USER" | "ASSISTANT",
        content: m.content,
      }));

    // 调用 AI 生成回复
    let aiResponse: string;
    let aiReviewId: string | null = null;

    try {
      const aiResult = await callDiaryChat(messagesForAI);
      aiResponse = aiResult.content;

      // 记录 AI 调用
      const aiReview = await prisma.aIReview.create({
        data: {
          diaryId: diary.id,
          kind: "DIARY_CHAT",
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
      console.error("AI 回复生成失败", error);
      return NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "AI 回复生成失败",
        },
        { status: 500 }
      );
    }

    // 存储 AI 回复
    const assistantMsg = await prisma.diaryMessage.create({
      data: {
        diaryId,
        role: "ASSISTANT",
        content: aiResponse,
      },
    });

    // 清除对话页面缓存
    revalidatePath(`/admin/diary/${diaryId}/chat`);
    revalidatePath(`/admin/diary/${diaryId}`);

    return NextResponse.json({
      ok: true,
      data: {
        userMessage: userMsg,
        assistantMessage: assistantMsg,
        aiReviewId,
      },
    });
  } catch (error) {
    console.error("日记对话失败", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "日记对话失败",
      },
      { status: 500 }
    );
  }
}

