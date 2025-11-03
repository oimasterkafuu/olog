import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth-helpers";

const updateSchema = z
  .object({
    title: z.string().min(1, "系列标题不能为空").optional(),
    slug: z
      .string()
      .min(1, "Slug 不能为空")
      .regex(/^[a-z0-9-]+$/, "Slug 仅支持小写字母、数字与短横线")
      .optional(),
    description: z.string().max(500).nullable().optional(),
    hidden: z.boolean().optional(),
    order: z.array(z.string().cuid()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "没有可更新的字段" });

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

  const uniqueOrder = parsed.data.order ? Array.from(new Set(parsed.data.order)) : undefined;

  try {
    await prisma.series.update({
      where: { id },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.slug !== undefined ? { slug: parsed.data.slug } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.hidden !== undefined ? { hidden: parsed.data.hidden } : {}),
        ...(uniqueOrder !== undefined ? { orderJson: uniqueOrder } : {}),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2001") {
        return jsonError("系列不存在", { status: 404 });
      }
      if (error.code === "P2002") {
        return jsonError("Slug 已存在，请更换", { status: 409 });
      }
    }
    console.error(error);
    return jsonError("更新系列失败", { status: 500 });
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
      await tx.post.updateMany({
        where: { seriesId: id },
        data: { seriesId: null },
      });
      await tx.series.delete({ where: { id } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2001") {
      return jsonError("系列不存在", { status: 404 });
    }
    console.error(error);
    return jsonError("删除系列失败", { status: 500 });
  }

  return jsonOk({ id });
}
