import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth-helpers";
import { storeFileFromBuffer, updateAttachmentBindingsTx } from "@/lib/attachments";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("response" in auth) {
    return auth.response;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("表单数据解析失败", { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonError("缺少文件", { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length === 0) {
    return jsonError("文件为空", { status: 400 });
  }

  const maxSize = 10 * 1024 * 1024; // 10MB
  if (buffer.length > maxSize) {
    return jsonError("文件超过 10MB 限制", { status: 400 });
  }

  const stored = await storeFileFromBuffer(buffer, file.name);

  const postId = formData.get("postId");
  if (typeof postId === "string" && postId) {
    try {
      await prisma.$transaction(async (tx) => {
        const post = await tx.post.findUnique({ where: { id: postId } });
        if (!post) {
          throw new Error("NOT_FOUND");
        }
        const current = Array.isArray(post.assetHashes) ? (post.assetHashes as string[]) : [];
        if (!current.includes(stored.sha256)) {
          const desired = [...current, stored.sha256];
          await updateAttachmentBindingsTx(tx, current, desired, postId);
        }
      });
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        return jsonError("文章不存在", { status: 404 });
      }
      console.error(error);
      return jsonError("绑定附件失败", { status: 500 });
    }
  }

  return jsonOk(stored);
}
