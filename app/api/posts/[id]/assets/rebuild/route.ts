import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth-helpers";
import { extractHashesFromMarkdown, updateAttachmentBindingsTx } from "@/lib/attachments";

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
      contentMd: true,
      assetHashes: true,
    },
  });

  if (!post) {
    return jsonError("文章不存在", { status: 404 });
  }

  const hashes = extractHashesFromMarkdown(post.contentMd, process.env.SITE_URL);

  await prisma.$transaction(async (tx) => {
    await updateAttachmentBindingsTx(tx, (post.assetHashes as string[]) ?? [], hashes, id);
  });

  return jsonOk({ hashes });
}
