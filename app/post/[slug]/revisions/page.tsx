import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageContainer } from "@/components/page-container";

async function getPostWithRevisions(slug: string) {
  return prisma.post.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      slug: true,
      revisions: {
        select: {
          id: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPostWithRevisions(params.slug);
  if (!post) {
    return { title: "文章未找到" };
  }
  return {
    title: `修订历史 - ${post.title}`,
  };
}

export default async function RevisionsPage({ params }: { params: { slug: string } }) {
  const post = await getPostWithRevisions(params.slug);
  if (!post) {
    notFound();
  }

  const revisions = post.revisions;
  const hasRevisions = revisions.length > 0;

  return (
    <PageContainer>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">文章修订历史</h1>
          <p className="mt-1 text-sm text-slate-500">{post.title}</p>
        </div>

        {!hasRevisions ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
            <p className="text-sm text-slate-600">暂无修订记录</p>
          </div>
        ) : (
          <div className="space-y-3">
            {revisions.map((revision, index) => {
              const isFirst = index === revisions.length - 1;
              const isLatest = index === 0;
              const previousRevision = index < revisions.length - 1 ? revisions[index + 1] : null;

              return (
                <div
                  key={revision.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-medium text-slate-900">
                          版本 {revisions.length - index}
                        </h2>
                        {isFirst && (
                          <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            初始版本
                          </span>
                        )}
                        {isLatest && (
                          <span className="inline-flex items-center rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            当前版本
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {revision.createdAt.toLocaleString("zh-CN", { hour12: false })}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/post/${post.slug}/revisions/${revision.id}`}
                        className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-100"
                      >
                        查看内容
                      </Link>
                      {previousRevision && (
                        <Link
                          href={`/post/${post.slug}/revisions/compare?from=${previousRevision.id}&to=${revision.id}`}
                          className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-100"
                        >
                          与上一版本对比
                        </Link>
                      )}
                      {!isLatest && (
                        <Link
                          href={`/post/${post.slug}/revisions/compare?from=${revision.id}&to=${revisions[0].id}`}
                          className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-100"
                        >
                          与当前版本对比
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="border-t border-slate-200 pt-4">
          <Link href={`/post/${post.slug}`} className="text-sm text-slate-700 underline">
            ← 返回文章
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}

