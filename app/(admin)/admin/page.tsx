import Link from "next/link";
import { prisma } from "@/lib/db";

async function getDashboardData() {
  const [totalPosts, publishedPosts, attachments] = await Promise.all([
    prisma.post.count(),
    prisma.post.count({ where: { status: "PUBLISHED" } }),
    prisma.attachment.count(),
  ]);

  const latestPosts = await prisma.post.findMany({
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      updatedAt: true,
    },
  });

  return { totalPosts, publishedPosts, draftPosts: totalPosts - publishedPosts, attachments, latestPosts };
}

export default async function AdminDashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">仪表盘</h1>
        <p className="mt-1 text-sm text-slate-500">快速了解当前博客内容概览。</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardCard label="文章总数" value={data.totalPosts} />
        <DashboardCard label="已发布" value={data.publishedPosts} />
        <DashboardCard label="草稿" value={data.draftPosts} />
        <DashboardCard label="附件数量" value={data.attachments} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">最近更新</h2>
          <Link href="/admin/posts" className="text-sm text-slate-500 hover:text-slate-900">
            查看全部
          </Link>
        </div>
        <div className="mt-4 space-y-3">
          {data.latestPosts.length === 0 ? (
            <p className="text-sm text-slate-500">暂无文章，请先创建一篇文章。</p>
          ) : (
            data.latestPosts.map((post) => (
              <Link
                key={post.id}
                href={`/admin/posts/${post.id}`}
                className="flex items-center justify-between rounded border border-slate-100 px-3 py-2 text-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-800">{post.title}</p>
                  <p className="text-xs text-slate-500">Slug：{post.slug}</p>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    post.status === "PUBLISHED"
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {post.status === "PUBLISHED" ? "已发布" : "草稿"}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function DashboardCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
      <p className="text-xs text-slate-500 sm:text-sm">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
