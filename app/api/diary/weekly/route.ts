import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getLastWeekIdentifier, getWeekRange } from "@/lib/diary-date";
import { callDiaryWeeklySummary, calcCostForAI } from "@/lib/ai";

/**
 * POST /api/diary/weekly
 * 生成周总结
 * - 参数：{ weekIdentifier } 或自动计算上周
 * - 获取指定周所有已发布的日记
 * - 调用 AI 生成周总结
 * - 创建特殊 Diary 记录（isWeeklySummary = true）
 * - 记录 AIReview
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
    }

    const body = await req.json();
    let { weekIdentifier } = body;

    // 如果未提供周标识，使用上周
    if (!weekIdentifier) {
      weekIdentifier = getLastWeekIdentifier();
    }

    if (typeof weekIdentifier !== "string" || !/^\d{4}-W\d{2}$/.test(weekIdentifier)) {
      return NextResponse.json({ ok: false, error: "周标识格式不正确" }, { status: 400 });
    }

    // 检查是否已有该周的周总结
    const existingWeeklySummary = await prisma.diary.findFirst({
      where: {
        weekIdentifier,
        isWeeklySummary: true,
      },
    });

    if (existingWeeklySummary) {
      return NextResponse.json(
        { ok: false, error: "该周已有周总结，请先删除旧的周总结" },
        { status: 400 }
      );
    }

    // 获取该周所有已发布的日记
    const weekDiaries = await prisma.diary.findMany({
      where: {
        weekIdentifier,
        status: "PUBLISHED",
        isWeeklySummary: false,
      },
      orderBy: { diaryDate: "asc" },
      select: {
        diaryDate: true,
        summaryMd: true,
      },
    });

    if (weekDiaries.length === 0) {
      return NextResponse.json({ ok: false, error: "该周没有已发布的日记" }, { status: 400 });
    }

    // 过滤掉 summaryMd 为空的日记
    const validDiaries = weekDiaries.filter((d) => d.summaryMd && d.summaryMd.trim());

    if (validDiaries.length === 0) {
      return NextResponse.json({ ok: false, error: "该周没有有效内容的日记" }, { status: 400 });
    }

    // 调用 AI 生成周总结
    let weeklyContent: string;
    let aiReviewId: string | null = null;

    try {
      const aiResult = await callDiaryWeeklySummary(
        validDiaries.map((d) => ({
          diaryDate: d.diaryDate,
          summaryMd: d.summaryMd!,
        }))
      );
      weeklyContent = aiResult.content;

      // 生成周总结的特殊日记日期（使用周标识 + "-summary"）
      const weekRange = getWeekRange(weekIdentifier);
      const weeklySummaryDate = `${weekRange.start}_weekly`;

      // 创建周总结日记
      let weeklySummary;
      try {
        weeklySummary = await prisma.diary.create({
          data: {
            diaryDate: weeklySummaryDate,
            weekIdentifier,
            isWeeklySummary: true,
            status: "PUBLISHED",
            summaryMd: weeklyContent,
            publishedAt: new Date(),
          },
        });
      } catch (createError: any) {
        // 捕获唯一约束冲突（并发情况）
        if (createError.code === "P2002") {
          return NextResponse.json(
            { ok: false, error: "该周的周总结已存在（并发创建）" },
            { status: 409 }
          );
        }
        throw createError;
      }

      // 记录 AI 调用
      const aiReview = await prisma.aIReview.create({
        data: {
          diaryId: weeklySummary.id,
          kind: "DIARY_WEEKLY",
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

      // 清除相关页面缓存
      revalidatePath("/admin/diary");
      revalidatePath(`/admin/diary/${weeklySummary.id}`);
      revalidatePath("/diary");

      return NextResponse.json({
        ok: true,
        data: {
          weeklySummary,
          aiReviewId,
          weekIdentifier,
          diariesCount: validDiaries.length,
        },
      });
    } catch (error) {
      console.error("AI 周总结生成失败", error);
      return NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "AI 周总结生成失败",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("生成周总结失败", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "生成周总结失败",
      },
      { status: 500 }
    );
  }
}

