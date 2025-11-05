import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth-helpers";
import { extractHashesFromMarkdown, updateAttachmentBindingsTx, removeAllAttachmentsForPostWithinTx } from "@/lib/attachments";

const updateSchema = z
  .object({
    title: z.string().min(1, "标题不能为空").optional(),
    slug: z
      .string()
      .min(1, "Slug 不能为空")
      .regex(/^[a-z0-9-]+$/, "Slug 仅支持小写字母、数字与短横线")
      .optional(),
    contentMd: z.string().min(1, "正文不能为空").optional(),
    summary: z.string().optional().nullable(),
    coverUrl: z.string().url("封面地址格式不正确").optional().nullable(),
    autoSummary: z.boolean().optional(),
    hidden: z.boolean().optional(),
    seriesId: z.string().cuid().optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "没有可更新的字段",
  });

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request);
  if ("response" in auth) {
    return auth.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("请求体格式错误", { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "参数错误";
    return jsonError(message, { status: 422 });
  }

  const { id } = params;

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.post.findUnique({ where: { id } });
      if (!existing) {
        throw new Error("NOT_FOUND");
      }

      if (parsed.data.slug && parsed.data.slug !== existing.slug) {
        const dup = await tx.post.findUnique({ where: { slug: parsed.data.slug } });
        if (dup) {
          throw new Error("SLUG_EXISTS");
        }
      }

      const data: Prisma.PostUpdateInput = {};
      if (parsed.data.title !== undefined) data.title = parsed.data.title;
      if (parsed.data.slug !== undefined) data.slug = parsed.data.slug;
      if (parsed.data.contentMd !== undefined) data.contentMd = parsed.data.contentMd;
      if (parsed.data.summary !== undefined) data.summary = parsed.data.summary ?? null;
      if (parsed.data.coverUrl !== undefined) data.coverUrl = parsed.data.coverUrl ?? null;
      if (parsed.data.autoSummary !== undefined) data.autoSummary = parsed.data.autoSummary;
      if (parsed.data.hidden !== undefined) data.hidden = parsed.data.hidden;
      if (parsed.data.seriesId !== undefined) data.series = parsed.data.seriesId ? { connect: { id: parsed.data.seriesId } } : { disconnect: true };

      await tx.post.update({ where: { id }, data });

      // 如果是已发布文章且正文有变化，创建新 revision
      if (existing.status === 'PUBLISHED' && parsed.data.contentMd !== undefined && parsed.data.contentMd !== existing.contentMd) {
        await tx.revision.create({
          data: {
            postId: id,
            contentMd: parsed.data.contentMd,
          },
        });
      }

      if (parsed.data.contentMd !== undefined) {
        const siteUrl = process.env.SITE_URL;
        const hashes = extractHashesFromMarkdown(parsed.data.contentMd, siteUrl);
        await updateAttachmentBindingsTx(tx, existing.assetHashes as string[] | null | undefined, hashes, id);
      }
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return jsonError("文章不存在", { status: 404 });
      }
      if (error.message === "SLUG_EXISTS") {
        return jsonError("Slug 已存在，请更换", { status: 409 });
      }
    }
    console.error(error);
    return jsonError("更新失败", { status: 500 });
  }

  return jsonOk({ id });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request);
  if ("response" in auth) {
    return auth.response;
  }

  const { id } = params;

  try {
    await prisma.$transaction(async (tx) => {
      const post = await tx.post.findUnique({ where: { id } });
      if (!post) {
        throw new Error("NOT_FOUND");
      }

      await removeAllAttachmentsForPostWithinTx(tx, id);
      await tx.aIReview.deleteMany({ where: { postId: id } });
      await tx.post.delete({ where: { id } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return jsonError("文章不存在", { status: 404 });
    }
    console.error(error);
    return jsonError("删除失败", { status: 500 });
  }

  return jsonOk({ id });
}
