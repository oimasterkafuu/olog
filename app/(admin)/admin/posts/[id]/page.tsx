import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PostEditWorkspace } from "@/components/post-edit-workspace";
import { MarkdownViewer } from "@/components/markdown-viewer";
import { RegenerateSummaryButton } from "@/components/regenerate-summary-button";

export const metadata = {
  title: "编辑文章",
};

async function getPost(id: string) {
  return prisma.post.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      slug: true,
      contentMd: true,
      autoSummary: true,
      hidden: true,
      metaJson: true,
      status: true,
      summary: true,
      coverUrl: true,
      seriesId: true,
      assetHashes: true,
      createdAt: true,
      updatedAt: true,
      publishedAt: true,
    },
  });
}

async function getSeriesOptions() {
  return prisma.series.findMany({
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });
}

async function getAttachmentsByHashes(hashes: string[]) {
  if (hashes.length === 0) return [] as {
    sha256: string;
    path: string;
    mime: string;
    size: number;
  }[];

  const attachments = await prisma.attachment.findMany({
    where: { sha256: { in: hashes } },
    select: { sha256: true, path: true, mime: true, size: true },
  });

  const map = new Map(attachments.map((item) => [item.sha256, item]));
  return hashes
    .map((hash) => map.get(hash))
    .filter((item): item is { sha256: string; path: string; mime: string; size: number } => Boolean(item));
}

export default async function EditPostPage({ params }: { params: { id: string } }) {
  const post = await getPost(params.id);
  if (!post) {
    notFound();
  }

  const seriesOptions = await getSeriesOptions();
  const assetHashes = Array.isArray(post.assetHashes) ? (post.assetHashes as string[]) : [];
  const attachments = await getAttachmentsByHashes(assetHashes);

  const meta = (post.metaJson as { tags?: string[] } | null) ?? { tags: [] };
  const tags = Array.isArray(meta.tags) ? meta.tags : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">编辑文章</h1>
          <p className="mt-1 text-sm text-slate-500">
            状态：{post.status === "PUBLISHED" ? "已发布" : "草稿"}，最后更新：
            {post.updatedAt.toLocaleString("zh-CN", { hour12: false })}
          </p>
        </div>
      </div>
      <PostEditWorkspace
        post={{
          id: post.id,
          title: post.title,
          slug: post.slug,
          contentMd: post.contentMd,
          autoSummary: post.autoSummary,
          hidden: post.hidden,
          status: post.status,
          seriesId: post.seriesId,
          publishedAt: post.publishedAt?.toISOString() ?? null,
        }}
        seriesOptions={seriesOptions}
      />

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-medium text-slate-900">AI 摘要</h2>
            <RegenerateSummaryButton postId={post.id} />
          </div>
          {post.summary ? (
            <div className="mt-3">
              <MarkdownViewer content={post.summary} className="prose prose-sm max-w-none text-slate-700" />
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">暂无摘要，发布时可自动生成或点击右侧按钮手动生成。</p>
          )}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-medium text-slate-900">关键词标签</h2>
          {tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">尚未生成关键词。</p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-lg font-medium text-slate-900">附件引用</h2>
        {attachments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">正文中未引用附件。</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {attachments.map((asset) => (
              <li
                key={asset.sha256}
                className="flex flex-col gap-3 rounded border border-slate-100 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <p className="break-all text-sm font-medium text-slate-800">{asset.path}</p>
                  <p className="text-xs text-slate-500">{asset.mime} · {formatFileSize(asset.size)}</p>
                </div>
                <a
                  href={asset.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-slate-600 underline"
                >
                  查看
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}
