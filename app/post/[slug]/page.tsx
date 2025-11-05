import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageContainer } from "@/components/page-container";
import { MarkdownViewer } from "@/components/markdown-viewer";

async function getPublishedPost(slug: string) {
  return prisma.post.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      slug: true,
      contentMd: true,
      summary: true,
      metaJson: true,
      assetHashes: true,
      publishedAt: true,
      series: { select: { id: true, title: true, slug: true } },
    },
  });
}

async function getAttachments(hashes: string[]) {
  if (hashes.length === 0) return [] as { sha256: string; path: string; mime: string; size: number }[];
  const attachments = await prisma.attachment.findMany({
    where: { sha256: { in: hashes } },
    select: { sha256: true, path: true, mime: true, size: true },
  });
  const map = new Map(attachments.map((item) => [item.sha256, item]));
  return hashes
    .map((hash) => map.get(hash))
    .filter((item): item is { sha256: string; path: string; mime: string; size: number } => Boolean(item));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPublishedPost(params.slug);
  if (!post) {
    return { title: "文章未找到" };
  }
  return {
    title: `${post.title} - oimasterkafuu`,
    description: post.summary ?? undefined,
    keywords: (((post.metaJson as { tags?: string[] } | null)?.tags ?? []) as string[]).join(', ')
  };
}

export default async function PostDetailPage({ params }: { params: { slug: string } }) {
  const post = await getPublishedPost(params.slug);
  if (!post) {
    notFound();
  }

  const tags = ((post.metaJson as { tags?: string[] } | null)?.tags ?? []) as string[];
  const assetHashes = Array.isArray(post.assetHashes) ? (post.assetHashes as string[]) : [];
  const attachments = await getAttachments(assetHashes);

  return (
    <PageContainer>
      <article className="space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">{post.title}</h1>
          <p className="text-xs text-slate-500 sm:text-sm">
            {post.publishedAt ? post.publishedAt.toLocaleString("zh-CN", { hour12: false }) : "发布时间待定"}
            {post.series ? (
              <>
                {" · 属于系列 "}
                <Link href={`/series/${post.series.slug}`} className="underline">
                  {post.series.title}
                </Link>
              </>
            ) : null}
          </p>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                  {tag}
                </span>
              ))}
            </div>
          )}
          {post.summary && (
            <div className="rounded border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <MarkdownViewer content={post.summary} className="prose prose-sm max-w-none text-slate-700" />
            </div>
          )}
        </header>

        <div className="markdown-content">
          <MarkdownViewer content={post.contentMd} />
        </div>

        {attachments.length > 0 && (
          <section className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-600 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900">附件列表</h2>
            <ul className="mt-3 space-y-2">
              {attachments.map((asset) => (
                <li key={asset.sha256}>
                  <a href={asset.path} className="underline" target="_blank" rel="noopener noreferrer">
                    {asset.path}
                  </a>{" "}
                  <span>({asset.mime} · {formatFileSize(asset.size)})</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="border-t border-dashed border-slate-200 pt-4 text-sm text-slate-500">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Link href="/" className="underline">
              ← 返回首页
            </Link>
            {post.series ? (
              <Link href={`/series/${post.series.slug}`} className="underline">
                ← 返回系列 {post.series.title}
              </Link>
            ) : null}
            <Link href={`/post/${post.slug}/revisions`} className="underline">
              查看修订历史
            </Link>
          </div>
        </footer>
      </article>
    </PageContainer>
  );
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}
