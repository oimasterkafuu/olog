import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth-helpers";

export const runtime = "nodejs";

/**
 * GET /api/attachments
 * 获取所有附件及其引用的文章信息
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("response" in auth) {
    return auth.response;
  }

  try {
    // 获取所有附件
    const attachments = await prisma.attachment.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // 获取所有文章的 assetHashes
    const posts = await prisma.post.findMany({
      select: {
        id: true,
        title: true,
        slug: true,
        assetHashes: true,
      },
    });

    // 构建附件到文章的映射
    const attachmentsWithRefs = attachments.map((attachment) => {
      // 查找引用该附件的文章
      const referencedBy = posts.filter((post) => {
        const hashes = Array.isArray(post.assetHashes) ? post.assetHashes as string[] : [];
        return hashes.includes(attachment.sha256);
      }).map((post) => ({
        id: post.id,
        title: post.title,
        slug: post.slug,
      }));

      return {
        ...attachment,
        referencedBy,
      };
    });

    return jsonOk(attachmentsWithRefs);
  } catch (error) {
    console.error('Failed to fetch attachments:', error);
    return jsonError("获取附件列表失败", { status: 500 });
  }
}

/**
 * DELETE /api/attachments?sha256=xxx
 * 删除指定的附件（仅当 refCount = 0 时）
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("response" in auth) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const sha256 = searchParams.get('sha256');

  if (!sha256) {
    return jsonError("缺少 sha256 参数", { status: 400 });
  }

  try {
    const attachment = await prisma.attachment.findUnique({
      where: { sha256 },
    });

    if (!attachment) {
      return jsonError("附件不存在", { status: 404 });
    }

    if (attachment.refCount > 0) {
      return jsonError("附件仍被文章引用，无法删除", { status: 400 });
    }

    // 删除文件
    const uploadsDir = join(process.cwd(), "public", "uploads");
    const fileName = attachment.ext ? `${sha256}.${attachment.ext}` : undefined;
    
    if (fileName) {
      try {
        await fs.unlink(join(uploadsDir, fileName));
      } catch (err) {
        console.error('Failed to delete file:', err);
        // 即使文件删除失败，也继续删除数据库记录
      }
    } else {
      // 如果没有扩展名，尝试查找文件
      try {
        const files = await fs.readdir(uploadsDir);
        const fallback = files.find((name) => name.startsWith(sha256));
        if (fallback) {
          await fs.unlink(join(uploadsDir, fallback));
        }
      } catch (err) {
        console.error('Failed to delete file:', err);
      }
    }

    // 删除数据库记录
    await prisma.attachment.delete({
      where: { sha256 },
    });

    return jsonOk({ message: "附件已删除" });
  } catch (error) {
    console.error('Failed to delete attachment:', error);
    return jsonError("删除附件失败", { status: 500 });
  }
}

