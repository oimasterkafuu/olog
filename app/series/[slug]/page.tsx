import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageContainer } from "@/components/page-container";
import { PostCard } from "@/components/post-card";

async function getSeriesBySlug(slug: string) {
  return prisma.series.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      orderJson: true,
    },
  });
}

async function getSeriesPosts(seriesId: string) {
  return prisma.post.findMany({
    where: { 
      seriesId, 
      status: "PUBLISHED",
      hidden: false
    },
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      metaJson: true,
      publishedAt: true,
    },
  });
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const series = await getSeriesBySlug(params.slug);
  if (!series) {
    return { title: "系列未找到" };
  }
  return {
    title: `${series.title} - 系列 - oimasterkafuu`,
    description: series.description ?? undefined,
  };
}

export default async function SeriesDetailPage({ params }: { params: { slug: string } }) {
  const series = await getSeriesBySlug(params.slug);
  if (!series) {
    notFound();
  }

  const posts = await getSeriesPosts(series.id);
  const orderArray = Array.isArray(series.orderJson)
    ? (series.orderJson as unknown[]).filter((id): id is string => typeof id === "string")
    : [];
  const postMap = new Map(posts.map((post) => [post.id, post]));
  const orderedPosts = [...orderArray, ...posts.filter((post) => !orderArray.includes(post.id)).map((post) => post.id)]
    .map((id) => postMap.get(id))
    .filter((item): item is (typeof posts)[number] => Boolean(item));

  return (
    <PageContainer>
      <header className="space-y-3">
        <h1 className="text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">{series.title}</h1>
        {series.description ? (
          <p className="text-sm text-slate-600 sm:text-base">{series.description}</p>
        ) : (
          <p className="text-sm text-slate-500">该系列暂无简介。</p>
        )}
      </header>

      <section className="mt-8 space-y-4">
        {orderedPosts.length === 0 ? (
          <p className="rounded border border-dashed border-slate-200 px-4 py-10 text-center text-slate-500">
            该系列暂无已发布的文章。
          </p>
        ) : (
          orderedPosts.map((post, index) => {
            const tags = ((post.metaJson as { tags?: string[] } | null)?.tags ?? []) as string[];
            return (
              <PostCard
                key={post.id}
                title={post.title}
                href={`/post/${post.slug}`}
                publishedAt={post.publishedAt}
                summary={post.summary}
                tags={tags}
                summaryFallback="暂无摘要，点击查看全文。"
                leading={<span>第 {index + 1} 篇</span>}
              />
            );
          })
        )}
      </section>

      <footer className="mt-8 text-sm text-slate-500">
        <Link href="/" className="underline">
          ← 返回首页
        </Link>
      </footer>
    </PageContainer>
  );
}
