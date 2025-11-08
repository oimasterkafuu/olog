import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getDiaryDate, getWeekIdentifier } from "@/lib/diary-date";
import { callDiaryStart, calcCostForAI } from "@/lib/ai";

/**
 * POST /api/diary/start
 * 开始今天的日记
 * - 检查今天是否已有日记（基于 30 小时制）
 * - 若已存在，返回现有日记 ID
 * - 若不存在，创建新 Diary 记录并生成 AI 开场白
 */
export async function POST() {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
    }

    const diaryDate = getDiaryDate();
    const weekIdentifier = getWeekIdentifier(diaryDate);

    // 检查今天是否已有日记（含消息）
    let existing = await prisma.diary.findUnique({
      where: { diaryDate },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    // 如果已存在且有消息，直接返回
    if (existing && existing.messages.length > 0) {
      return NextResponse.json({
        ok: true,
        data: {
          diary: existing,
          isNew: false,
        },
      });
    }

    // 使用 upsert 原子性地创建或获取日记（避免并发冲突）
    const diary = await prisma.diary.upsert({
      where: { diaryDate },
      update: {}, // 如果已存在，不更新
      create: {
        diaryDate,
        weekIdentifier,
        status: "CHATTING",
      },
    });

    // 判断是否是新创建的（通过检查是否有消息）
    const isNewDiary = !existing;

    // 只有新创建的日记才生成 AI 开场白
    let aiReviewId: string | null = null;
    if (isNewDiary) {
      let aiGreeting: string;

      try {
        const aiResult = await callDiaryStart();
        aiGreeting = aiResult.content;

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
        console.error("AI 开场白生成失败", error);
        // 降级：使用默认开场白
        aiGreeting = "嗨！今天过得怎么样？有什么想和我分享的吗？";
      }

      // 存储开场白消息
      await prisma.diaryMessage.create({
        data: {
          diaryId: diary.id,
          role: "ASSISTANT",
          content: aiGreeting,
        },
      });
    }

    // 重新获取完整的日记数据（含消息）
    const diaryWithMessages = await prisma.diary.findUnique({
      where: { id: diary.id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        diary: diaryWithMessages,
        isNew: isNewDiary,
        aiReviewId,
      },
    });
  } catch (error) {
    console.error("开始日记失败", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "开始日记失败",
      },
      { status: 500 }
    );
  }
}

