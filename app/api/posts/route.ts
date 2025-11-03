import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth-helpers";

const createSchema = z.object({
  title: z.string().min(1, "标题不能为空"),
  slug: z
    .string()
    .min(1, "Slug 不能为空")
    .regex(/^[a-z0-9-]+$/, "Slug 仅支持小写字母、数字与短横线"),
  contentMd: z.string().min(1, "正文不能为空"),
  autoSummary: z.boolean().optional(),
  hidden: z.boolean().optional(),
  seriesId: z.string().cuid().optional().nullable(),
});

export async function POST(request: NextRequest) {
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "参数错误";
    return jsonError(message, { status: 422 });
  }

  const { title, slug, contentMd, autoSummary = true, hidden = false, seriesId } = parsed.data;

  const exists = await prisma.post.findUnique({ where: { slug } });
  if (exists) {
    return jsonError("Slug 已存在，请更换", { status: 409 });
  }

  const post = await prisma.post.create({
    data: {
      title,
      slug,
      contentMd,
      autoSummary,
      hidden,
      seriesId: seriesId ?? null,
      status: "DRAFT",
      metaJson: { tags: [] },
      assetHashes: [],
    },
  });

  return jsonOk({ id: post.id });
}
