import Link from "next/link";
import { prisma } from "@/lib/db";
import { DeletePostButton } from "@/components/delete-post-button";
import { TogglePostVisibilityButton } from "@/components/toggle-post-visibility-button";
import { ResponsiveTable } from "@/components/responsive-table";

export const metadata = {
  title: "文章管理",
};

async function getPosts() {
  return prisma.post.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      hidden: true,
      updatedAt: true,
      publishedAt: true,
    },
  });
}

export default async function AdminPostsPage() {
  const posts = await getPosts();

  const rows = posts.map((post) => ({
    ...post,
    publishedLabel:
      post.status === "PUBLISHED" && post.publishedAt
        ? post.publishedAt.toLocaleString("zh-CN", { hour12: false })
        : null,
    updatedLabel: post.updatedAt.toLocaleString("zh-CN", { hour12: false }),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">文章管理</h1>
          <p className="mt-1 text-sm text-slate-500">管理草稿与已发布文章，支持编辑与删除。</p>
        </div>
        <Link
          href="/admin/posts/new"
          className="inline-flex items-center justify-center rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          新建文章
        </Link>
      </div>

      <ResponsiveTable
        className="md:rounded-lg md:border md:border-slate-200 md:bg-white md:shadow-sm"
        rows={rows}
        emptyState="暂无文章，请先创建。"
        columns={[
          {
            id: "title",
            header: "标题",
            accessor: (post) => (
              <div className="space-y-1">
                <p className="font-medium text-slate-800">{post.title}</p>
                {post.publishedLabel ? (
                  <p className="text-xs text-slate-500">发布于 {post.publishedLabel}</p>
                ) : null}
              </div>
            ),
            mobile: "primary",
            mobileAccessor: (post) => (
              <div className="space-y-2">
                <div className="text-base font-medium text-slate-900">{post.title}</div>
                <div className="text-xs text-slate-500">Slug：{post.slug}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <StatusBadge status={post.status} />
                  <VisibilityBadge hidden={post.hidden} />
                  <span>更新于 {post.updatedLabel}</span>
                  {post.publishedLabel ? <span>发布于 {post.publishedLabel}</span> : null}
                </div>
              </div>
            ),
          },
          {
            id: "slug",
            header: "Slug",
            accessor: (post) => <span className="text-slate-600">{post.slug}</span>,
            mobile: "hidden",
          },
          {
            id: "status",
            header: "状态",
            accessor: (post) => <StatusBadge status={post.status} />, 
            mobile: "hidden",
          },
          {
            id: "visibility",
            header: "可见性",
            accessor: (post) => <VisibilityBadge hidden={post.hidden} />,
            mobile: "hidden",
          },
          {
            id: "updatedAt",
            header: "更新时间",
            accessor: (post) => <span className="text-slate-600">{post.updatedLabel}</span>,
            mobile: "hidden",
          },
          {
            id: "actions",
            header: "操作",
            accessor: (post) => (
              <div className="flex justify-end gap-2">
                <Link
                  href={`/admin/posts/${post.id}`}
                  className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-100"
                >
                  编辑
                </Link>
                <TogglePostVisibilityButton postId={post.id} hidden={post.hidden} />
                <DeletePostButton postId={post.id} postTitle={post.title} />
              </div>
            ),
            headerClassName: "text-right",
            cellClassName: "text-right",
            mobile: "meta",
            mobileLabel: "操作",
            mobileAccessor: (post) => (
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/admin/posts/${post.id}`}
                  className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-100"
                >
                  编辑
                </Link>
                <TogglePostVisibilityButton postId={post.id} hidden={post.hidden} />
                <DeletePostButton postId={post.id} postTitle={post.title} />
              </div>
            ),
          },
        ]}
        getRowKey={(row) => row.id}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: "DRAFT" | "PUBLISHED" }) {
  const isPublished = status === "PUBLISHED";
  const baseClass = "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium";
  return (
    <span className={`${baseClass} ${isPublished ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
      {isPublished ? "已发布" : "草稿"}
    </span>
  );
}

function VisibilityBadge({ hidden }: { hidden: boolean }) {
  const baseClass = "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium";
  return (
    <span className={`${baseClass} ${hidden ? "bg-slate-100 text-slate-600" : "bg-slate-50 text-slate-500"}`}>
      {hidden ? "已隐藏" : "公开"}
    </span>
  );
}
