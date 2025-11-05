import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth-helpers";
import { callSummary, calcCostForAI, extractAIContext } from "@/lib/ai";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request);
  if ("response" in auth) {
    return auth.response;
  }

  const { id } = params;

  const post = await prisma.post.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      contentMd: true,
    },
  });

  if (!post) {
    return jsonError("文章不存在", { status: 404 });
  }

  if (!post.title || !post.contentMd) {
    return jsonError("文章标题或内容为空，无法生成摘要", { status: 400 });
  }

  let summaryResult;
  try {
    summaryResult = await callSummary({ title: post.title, markdown: post.contentMd });
  } catch (error) {
    console.error("summary generation failed", error);
    const ctx = extractAIContext(error);
    if (ctx) {
      try {
        await prisma.aIReview.create({
          data: {
            postId: id,
            kind: "SUMMARY",
            model: ctx.model,
            prompt: ctx.prompt ?? null,
            inputHash: ctx.inputHash,
            ok: false,
            errorMessage: error instanceof Error ? error.message : String(error),
            rawText: ctx.rawText ?? null,
            tokenUsage: ctx.usage?.total_tokens ?? 0,
            cost: (await calcCostForAI(ctx.usage ?? {})) ?? undefined,
          },
        });
      } catch (logError) {
        console.error("failed to record summary AIReview", logError);
      }
    }
    return jsonError(error instanceof Error ? error.message : "AI 摘要生成失败", { status: 502 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.post.update({
        where: { id },
        data: {
          summary: summaryResult.result.summary,
        },
      });

      await tx.aIReview.create({
        data: {
          postId: id,
          kind: "SUMMARY",
          model: summaryResult.model,
          prompt: summaryResult.prompt,
          inputHash: summaryResult.inputHash,
          ok: true,
          outputJson: summaryResult.result as unknown as Prisma.InputJsonValue,
          rawText: summaryResult.rawText,
          tokenUsage: summaryResult.usage.total_tokens ?? 0,
          cost: (await calcCostForAI(summaryResult.usage)) ?? undefined,
        },
      });
    });
  } catch (error) {
    console.error("save summary failed", error);
    return jsonError("摘要保存失败", { status: 500 });
  }

  return jsonOk({
    summary: summaryResult.result.summary,
  });
}

