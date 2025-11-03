export const dynamic = 'force-dynamic'
import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageContainer } from "@/components/page-container";
import { PostCard } from "@/components/post-card";

async function getLatestPosts() {
  return prisma.post.findMany({
    where: {
      status: "PUBLISHED",
      hidden: false,
      OR: [
        { seriesId: null },
        { series: { hidden: false } }
      ]
    },
    orderBy: { publishedAt: "desc" },
    take: 5,
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

async function getAllSeries() {
  return prisma.series.findMany({
    where: { hidden: false },
    orderBy: { title: "asc" },
    select: { id: true, title: true, slug: true },
  });
}

export default async function HomePage() {
  const [posts, series] = await Promise.all([getLatestPosts(), getAllSeries()]);

  return (
    <PageContainer>
      <section className="space-y-4 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">oimasterkafuu</h1>
        <p className="text-sm text-slate-600 sm:text-base">互联网上的一座孤岛</p>
        <nav className="flex flex-wrap justify-center gap-2 text-xs text-slate-500 sm:gap-3 sm:text-sm">
          {series.length === 0 ? (
            <span>暂无系列</span>
          ) : (
            series.map((item) => (
              <Link key={item.id} href={`/series/${item.slug}`} className="underline">
                {item.title}
              </Link>
            ))
          )}
        </nav>
      </section>

      <section className="mt-10 space-y-4">
        <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
          <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">最新文章</h2>
        </div>
        <div className="space-y-4">
          {posts.length === 0 ? (
            <p className="rounded border border-dashed border-slate-200 px-4 py-10 text-center text-slate-500">
              暂无发布的文章，登录后台以开始创作。
            </p>
          ) : (
            posts.map((post) => {
              const tags = ((post.metaJson as { tags?: string[] } | null)?.tags ?? []) as string[];
              return (
                <PostCard
                  key={post.id}
                  title={post.title}
                  href={`/post/${post.slug}`}
                  publishedAt={post.publishedAt}
                  summary={post.summary}
                  summaryFallback="暂无摘要，点击查看全文。"
                  tags={tags}
                />
              );
            })
          )}
        </div>
      </section>
    </PageContainer>
  );
}
