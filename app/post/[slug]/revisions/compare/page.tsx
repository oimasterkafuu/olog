import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { diffLines, Change } from "diff";
import { prisma } from "@/lib/db";
import { PageContainer } from "@/components/page-container";

async function getRevisionsForCompare(slug: string, fromId: string, toId: string) {
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

  const [fromRevision, toRevision] = await Promise.all([
    prisma.revision.findFirst({
      where: {
        id: fromId,
        postId: post.id,
      },
      select: {
        id: true,
        contentMd: true,
        createdAt: true,
      },
    }),
    prisma.revision.findFirst({
      where: {
        id: toId,
        postId: post.id,
      },
      select: {
        id: true,
        contentMd: true,
        createdAt: true,
      },
    }),
  ]);

  if (!fromRevision || !toRevision) {
    return null;
  }

  return { post, fromRevision, toRevision };
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const post = await prisma.post.findFirst({
    where: { slug: params.slug, status: "PUBLISHED" },
    select: { title: true },
  });

  if (!post) {
    return { title: "版本对比" };
  }

  return {
    title: `版本对比 - ${post.title}`,
  };
}

export default async function CompareRevisionsPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { from?: string; to?: string };
}) {
  const { from, to } = searchParams;

  if (!from || !to) {
    return (
      <PageContainer>
        <div className="space-y-6">
          <h1 className="text-2xl font-semibold text-slate-900">版本对比</h1>
          <div className="rounded-lg border border-slate-300 bg-slate-100 p-4">
            <p className="text-sm text-slate-800">缺少对比参数，请从修订历史页面选择版本进行对比。</p>
          </div>
          <Link href={`/post/${params.slug}/revisions`} className="text-sm text-slate-700 underline">
            ← 返回修订历史
          </Link>
        </div>
      </PageContainer>
    );
  }

  const data = await getRevisionsForCompare(params.slug, from, to);
  if (!data) {
    notFound();
  }

  const { post, fromRevision, toRevision } = data;
  const changes = diffLines(fromRevision.contentMd, toRevision.contentMd);

  return (
    <PageContainer>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-slate-900">版本对比</h1>
          <p className="mt-1 text-sm text-slate-500">{post.title}</p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-medium text-slate-700">旧版本</p>
            <p className="mt-1 text-sm text-slate-500">
              {fromRevision.createdAt.toLocaleString("zh-CN", { hour12: false })}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-medium text-slate-700">新版本</p>
            <p className="mt-1 text-sm text-slate-500">
              {toRevision.createdAt.toLocaleString("zh-CN", { hour12: false })}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-base font-medium text-slate-900">差异对比</h2>
          <div className="space-y-1 overflow-x-auto">
            {changes.map((change: Change, idx: number) => {
              const lines = change.value.split("\n");
              // Remove the last empty line if it exists
              if (lines[lines.length - 1] === "") {
                lines.pop();
              }

              return lines.map((line, lineIdx) => {
                let bgColor = "bg-slate-50";
                let textColor = "text-slate-700";
                let marker = " ";

                if (change.added) {
                  bgColor = "bg-green-50";
                  textColor = "text-green-800";
                  marker = "+";
                } else if (change.removed) {
                  bgColor = "bg-red-50";
                  textColor = "text-red-800";
                  marker = "-";
                }

                return (
                  <div
                    key={`${idx}-${lineIdx}`}
                    className={`flex font-mono text-sm ${bgColor} ${textColor}`}
                  >
                    <span className="inline-block w-8 flex-shrink-0 select-none px-2 text-slate-400">
                      {marker}
                    </span>
                    <span className="flex-1 whitespace-pre-wrap break-words pr-2">
                      {line || " "}
                    </span>
                  </div>
                );
              });
            })}
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <div className="flex flex-col gap-2 text-sm text-slate-700 sm:flex-row sm:gap-4">
            <Link href={`/post/${post.slug}/revisions`} className="underline">
              ← 返回修订历史
            </Link>
            <Link href={`/post/${post.slug}`} className="underline">
              ← 返回文章
            </Link>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

