import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth-helpers";

const createSchema = z.object({
  title: z.string().min(1, "系列标题不能为空"),
  slug: z
    .string()
    .min(1, "Slug 不能为空")
    .regex(/^[a-z0-9-]+$/, "Slug 仅支持小写字母、数字与短横线"),
  description: z.string().max(500).optional().nullable(),
  hidden: z.boolean().optional(),
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

  const { title, slug, description, hidden = false } = parsed.data;

  try {
    const created = await prisma.series.create({
      data: {
        title,
        slug,
        description: description ?? null,
        hidden,
        orderJson: [],
      },
      select: { id: true },
    });

    return jsonOk({ id: created.id });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError("Slug 已存在，请更换", { status: 409 });
    }
    console.error(error);
    return jsonError("创建系列失败", { status: 500 });
  }
}
