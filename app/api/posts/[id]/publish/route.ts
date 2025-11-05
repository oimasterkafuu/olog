import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import pangu from "pangu";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth-helpers";
import { extractHashesFromMarkdown, updateAttachmentBindingsTx } from "@/lib/attachments";
import {
  callPublishMetadata,
  callSummary,
  calcCostForAI,
  extractAIContext,
} from "@/lib/ai";
import { ensureUniquePostSlug, fallbackSlugFromTitle, isDefaultGeneratedSlug } from "@/lib/slugs";

export const runtime = "nodejs";

const requestSchema = z
  .object({
    needSummary: z.boolean().optional(),
  })
  .optional();

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request);
  if ("response" in auth) {
    return auth.response;
  }

  const bodyRaw = await request.text();
  let parsedBody: z.infer<typeof requestSchema>;
  if (!bodyRaw) {
    parsedBody = undefined;
  } else {
    try {
      parsedBody = requestSchema.parse(JSON.parse(bodyRaw));
    } catch (error) {
      return jsonError("请求体格式错误", { status: 400 });
    }
  }

  const { id } = params;

  const post = await prisma.post.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      slug: true,
      contentMd: true,
      status: true,
      autoSummary: true,
      metaJson: true,
      assetHashes: true,
      publishedAt: true,
      summary: true,
    },
  });

  if (!post) {
    return jsonError("文章不存在", { status: 404 });
  }

  if (post.status !== "DRAFT") {
    return jsonError("仅草稿可以发布", { status: 400 });
  }

  if (!post.title || !post.slug || !post.contentMd) {
    return jsonError("文章信息不完整，无法发布", { status: 400 });
  }

  const defaultSlug = isDefaultGeneratedSlug(post.slug);
  let metadataResult;
  try {
    metadataResult = await callPublishMetadata({
      title: post.title,
      markdown: post.contentMd,
      currentSlug: post.slug,
      needsSlug: defaultSlug,
    });
  } catch (error) {
    console.error("publish metadata failed", error);
    const ctx = extractAIContext(error);
    if (ctx) {
      try {
        await prisma.aIReview.create({
          data: {
            postId: id,
            kind: "PUBLISH_METADATA",
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
        console.error("failed to record metadata AIReview", logError);
      }
    }
    return jsonError(error instanceof Error ? error.message : "AI 处理失败", { status: 502 });
  }

  const needSummary = parsedBody?.needSummary ?? post.autoSummary;
  let summaryResult: Awaited<ReturnType<typeof callSummary>> | null = null;
  let summaryWarning: string | undefined;
  const warnings: string[] = metadataResult.warnings.map((item) => item.message);

  if (needSummary) {
    try {
      summaryResult = await callSummary({ title: post.title, markdown: post.contentMd });
    } catch (error) {
      console.warn("summary generation failed", error);
      summaryWarning = error instanceof Error ? error.message : "AI 摘要生成失败";
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
              errorMessage: summaryWarning,
              rawText: ctx.rawText ?? null,
              tokenUsage: ctx.usage?.total_tokens ?? 0,
              cost: (await calcCostForAI(ctx.usage ?? {})) ?? undefined,
            },
          });
        } catch (logError) {
          console.error("failed to record summary AIReview", logError);
        }
      }
    }
  }

  const formattedMarkdown = pangu.spacingText(post.contentMd);
  const siteUrl = process.env.SITE_URL;
  const assetHashes = extractHashesFromMarkdown(formattedMarkdown, siteUrl);

  let appliedSlug = post.slug;

  try {
    await prisma.$transaction(async (tx) => {
      const freshPost = await tx.post.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          metaJson: true,
          assetHashes: true,
        },
      });

      if (!freshPost) {
        throw new Error("NOT_FOUND");
      }
      if (freshPost.status !== "DRAFT") {
        throw new Error("STATE_CHANGED");
      }

      const preferredSlug = defaultSlug
        ? metadataResult.result.slug || fallbackSlugFromTitle(post.title)
        : post.slug;
      const finalSlug = await ensureUniquePostSlug(tx, preferredSlug, id);
      appliedSlug = finalSlug;

      const meta = (freshPost.metaJson as { tags?: string[] } | null) ?? {};
      const mergedMeta = { ...meta, tags: metadataResult.result.keywords };

      await tx.post.update({
        where: { id },
        data: {
          slug: finalSlug,
          contentMd: formattedMarkdown,
          metaJson: mergedMeta,
          summary: summaryResult?.result.summary ?? post.summary ?? null,
          status: "PUBLISHED",
          publishedAt: new Date(),
          autoSummary: needSummary,
        },
      });

      await updateAttachmentBindingsTx(
        tx,
        (freshPost.assetHashes as string[] | null | undefined) ?? [],
        assetHashes,
        id,
      );

      await tx.aIReview.create({
        data: {
          postId: id,
          kind: "PUBLISH_METADATA",
          model: metadataResult.model,
          prompt: metadataResult.prompt,
          inputHash: metadataResult.inputHash,
          ok: true,
          outputJson: metadataResult.result as unknown as Prisma.InputJsonValue,
          rawText: metadataResult.rawText,
          tokenUsage: metadataResult.usage.total_tokens ?? 0,
          cost: (await calcCostForAI(metadataResult.usage)) ?? undefined,
        },
      });

      if (summaryResult) {
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
      }
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return jsonError("文章不存在", { status: 404 });
      }
      if (error.message === "STATE_CHANGED") {
        return jsonError("文章状态已变更，请刷新后重试", { status: 409 });
      }
    }
    console.error("publish transaction failed", error);
    return jsonError("发布失败", { status: 500 });
  }

  if (summaryWarning) {
    warnings.push(summaryWarning);
  }

  return jsonOk({
    id,
    slug: appliedSlug,
    summaryGenerated: Boolean(summaryResult),
    warning: warnings.length ? warnings.join("；") : undefined,
  });
}
