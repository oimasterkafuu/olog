import type { Prisma } from "@prisma/client";

const DEFAULT_SLUG_PREFIX = "post-";

export function generateDefaultPostSlug(): string {
  return `${DEFAULT_SLUG_PREFIX}${Date.now()}`;
}

export function isDefaultGeneratedSlug(slug: string | null | undefined): boolean {
  if (!slug) {
    return false;
  }
  if (!slug.startsWith(DEFAULT_SLUG_PREFIX)) {
    return false;
  }
  const tail = slug.slice(DEFAULT_SLUG_PREFIX.length);
  return /^[0-9]+$/.test(tail);
}

export async function ensureUniquePostSlug(
  tx: Prisma.TransactionClient,
  preferredSlug: string,
  currentPostId: string,
): Promise<string> {
  const base = preferredSlug.toLowerCase();
  let candidate = base;
  let suffix = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await tx.post.findFirst({
      where: {
        slug: candidate,
        NOT: { id: currentPostId },
      },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

export function fallbackSlugFromTitle(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || generateDefaultPostSlug();
}
