import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageContainer } from "@/components/page-container";
import { MarkdownViewer } from "@/components/markdown-viewer";

async function getRevisionWithPost(slug: string, revisionId: string) {
  const post = await prisma.post.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      slug: true,
    },
  });

  if (!post) {
    return null;
  }

  const revision = await prisma.revision.findFirst({
    where: {
      id: revisionId,
      postId: post.id,
    },
    select: {
      id: true,
      contentMd: true,
      createdAt: true,
    },
  });

  if (!revision) {
    return null;
  }

  return { post, revision };
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string; revisionId: string };
}): Promise<Metadata> {
  const data = await getRevisionWithPost(params.slug, params.revisionId);
  if (!data) {
    return { title: "版本未找到" };
  }
  return {
    title: `历史版本 - ${data.post.title}`,
  };
}

export default async function RevisionDetailPage({
  params,
}: {
  params: { slug: string; revisionId: string };
}) {
  const data = await getRevisionWithPost(params.slug, params.revisionId);
  if (!data) {
    notFound();
  }

  const { post, revision } = data;

  return (
    <PageContainer>
      <article className="space-y-6">
        <header className="space-y-3">
          <h1 className="text-2xl font-semibold text-slate-900">{post.title}</h1>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              历史版本
            </span>
            <p className="text-sm text-slate-500">
              {revision.createdAt.toLocaleString("zh-CN", { hour12: false })}
            </p>
          </div>
        </header>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-600">
            这是文章的历史版本，可能与当前发布的内容不同。
          </p>
        </div>

        <div className="markdown-content">
          <MarkdownViewer content={revision.contentMd} />
        </div>

        <footer className="border-t border-slate-200 pt-4">
          <div className="flex flex-col gap-2 text-sm text-slate-700 sm:flex-row sm:gap-4">
            <Link href={`/post/${post.slug}/revisions`} className="underline">
              ← 返回修订历史
            </Link>
            <Link href={`/post/${post.slug}`} className="underline">
              ← 返回文章
            </Link>
          </div>
        </footer>
      </article>
    </PageContainer>
  );
}

