import { promises as fs } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { lookup as lookupMime } from "mime-types";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

const uploadsDir = join(process.cwd(), "public", "uploads");

export interface StoredFileResult {
  sha256: string;
  path: string;
  mime: string;
  size: number;
  ext: string;
}

async function ensureUploadsDir() {
  await fs.mkdir(uploadsDir, { recursive: true });
}

export async function storeFileFromBuffer(buffer: Buffer, filename: string): Promise<StoredFileResult> {
  await ensureUploadsDir();

  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const ext = extractExtension(filename) ?? guessExtensionFromMime(filename) ?? "bin";
  const mime = lookupMime(filename) || "application/octet-stream";
  const finalName = `${sha256}.${ext}`;
  const absPath = join(uploadsDir, finalName);

  try {
    await fs.access(absPath);
  } catch {
    await fs.writeFile(absPath, buffer);
  }

  const urlPath = `/uploads/${finalName}`;

  await prisma.attachment.upsert({
    where: { sha256 },
    update: {
      mime,
      ext,
      size: buffer.length,
      path: urlPath,
    },
    create: {
      sha256,
      mime,
      ext,
      size: buffer.length,
      path: urlPath,
      refCount: 0,
    },
  });

  return { sha256, path: urlPath, mime, size: buffer.length, ext };
}

function extractExtension(filename: string): string | null {
  const match = filename.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : null;
}

function guessExtensionFromMime(filename: string): string | null {
  const mime = lookupMime(filename) || undefined;
  if (!mime) return null;
  const [, subtype] = mime.split("/");
  return subtype ?? null;
}

export async function syncPostAttachments(postId: string, targetHashes: string[]) {
  const uniqueTargets = Array.from(new Set(targetHashes));

  await prisma.$transaction(async (tx) => {
    const post = await tx.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new Error("文章不存在");
    }

    await applyAttachmentDiff(tx, post.assetHashes as string[] | null | undefined, uniqueTargets, postId);
  });
}

async function ensureAttachmentRecord(tx: Prisma.TransactionClient, sha256: string) {
  const exists = await tx.attachment.findUnique({ where: { sha256 } });
  if (!exists) {
    await tx.attachment.create({
      data: {
        sha256,
        ext: "",
        mime: "application/octet-stream",
        size: 0,
        path: `/uploads/${sha256}`,
        refCount: 0,
      },
    });
  }
}

async function decrementAndCleanupAttachment(tx: Prisma.TransactionClient, sha256: string) {
  const attachment = await tx.attachment.update({
    where: { sha256 },
    data: { refCount: { decrement: 1 } },
  });

  if (attachment.refCount <= 0) {
    await tx.attachment.delete({ where: { sha256 } });
    const fileName = attachment.ext ? `${sha256}.${attachment.ext}` : undefined;
    if (fileName) {
      await fs.unlink(join(uploadsDir, fileName)).catch(() => undefined);
    } else {
      const files = await fs.readdir(uploadsDir).catch(() => [] as string[]);
      const fallback = files.find((name) => name.startsWith(sha256));
      if (fallback) {
        await fs.unlink(join(uploadsDir, fallback)).catch(() => undefined);
      }
    }
  }
}

async function applyAttachmentDiff(
  tx: Prisma.TransactionClient,
  currentRaw: string[] | null | undefined,
  desired: string[],
  postId: string,
) {
  const current = Array.isArray(currentRaw) ? currentRaw : [];
  const toAdd = desired.filter((hash) => !current.includes(hash));
  const toRemove = current.filter((hash) => !desired.includes(hash));

  if (toAdd.length > 0) {
    for (const hash of toAdd) {
      await ensureAttachmentRecord(tx, hash);
      await tx.attachment.update({
        where: { sha256: hash },
        data: { refCount: { increment: 1 } },
      });
    }
  }

  for (const hash of toRemove) {
    await decrementAndCleanupAttachment(tx, hash);
  }

  if (toAdd.length > 0 || toRemove.length > 0) {
    await tx.post.update({
      where: { id: postId },
      data: { assetHashes: desired },
    });
  }
}

export async function updateAttachmentBindingsTx(
  tx: Prisma.TransactionClient,
  currentHashes: string[] | null | undefined,
  desired: string[],
  postId: string,
) {
  await applyAttachmentDiff(tx, currentHashes, desired, postId);
}

export async function removeAllAttachmentsForPost(postId: string) {
  await prisma.$transaction(async (tx) => {
    await removeAllAttachmentsForPostWithinTx(tx, postId);
  });
}

export async function removeAllAttachmentsForPostWithinTx(
  tx: Prisma.TransactionClient,
  postId: string,
) {
  const post = await tx.post.findUnique({ where: { id: postId } });
  if (!post) {
    return;
  }

  const hashes = Array.isArray(post.assetHashes) ? (post.assetHashes as string[]) : [];
  for (const hash of hashes) {
    await decrementAndCleanupAttachment(tx, hash);
  }

  await tx.post.update({ where: { id: postId }, data: { assetHashes: [] } });
}

export function extractHashesFromMarkdown(markdown: string, siteUrl?: string): string[] {
  const normalizedSite = siteUrl?.replace(/\/$/, "");
  const pattern = /\]\(([^)]+)\)/g;
  const matches = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    const url = match[1];
    if (normalizedSite && url.startsWith("http") && !url.startsWith(normalizedSite)) {
      continue;
    }
    const hashMatch = url.match(/\/uploads\/(\b[a-f0-9]{64})\.[a-z0-9]+$/i);
    if (hashMatch) {
      matches.add(hashMatch[1].toLowerCase());
    }
  }

  return Array.from(matches);
}
