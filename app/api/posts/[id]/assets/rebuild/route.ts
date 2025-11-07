import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth-helpers";
import { extractHashesFromMarkdown, updateAttachmentBindingsTx } from "@/lib/attachments";
import { getConfig } from "@/lib/config";

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

  const siteUrl = await getConfig("SITE_URL");
  const hashes = extractHashesFromMarkdown(post.contentMd, siteUrl);

  await prisma.$transaction(async (tx) => {
    await updateAttachmentBindingsTx(tx, (post.assetHashes as string[]) ?? [], hashes, id);
  });

  return jsonOk({ hashes });
}
