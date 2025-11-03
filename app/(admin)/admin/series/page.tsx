import Link from "next/link";
import { prisma } from "@/lib/db";
import { DeleteSeriesButton } from "@/components/delete-series-button";
import { ToggleSeriesVisibilityButton } from "@/components/toggle-series-visibility-button";
import { ResponsiveTable } from "@/components/responsive-table";

export const metadata = {
  title: "系列管理",
};

async function getSeriesList() {
  return prisma.series.findMany({
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      hidden: true,
      _count: { select: { posts: true } },
    },
  });
}

export default async function SeriesListPage() {
  const series = await getSeriesList();
  const rows = series.map((item) => ({
    ...item,
    descriptionText: item.description ?? "暂无简介",
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">系列管理</h1>
          <p className="mt-1 text-sm text-slate-500">为文章分组并设定展示顺序。</p>
        </div>
        <Link
          href="/admin/series/new"
          className="inline-flex items-center justify-center rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          新建系列
        </Link>
      </div>

      <ResponsiveTable
        className="md:rounded-lg md:border md:border-slate-200 md:bg-white md:shadow-sm"
        rows={rows}
        getRowKey={(row) => row.id}
        emptyState="暂无系列，可点击右上角按钮创建。"
        columns={[
          {
            id: "title",
            header: "系列名称",
            accessor: (item) => (
              <Link href={`/admin/series/${item.id}`} className="font-medium text-slate-800 hover:underline">
                {item.title}
              </Link>
            ),
            mobile: "primary",
            mobileAccessor: (item) => (
              <div className="space-y-2">
                <Link href={`/admin/series/${item.id}`} className="text-base font-medium text-slate-900 hover:underline">
                  {item.title}
                </Link>
                <p className="text-xs text-slate-500">Slug：{item.slug}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <VisibilityBadge hidden={item.hidden} />
                </div>
                <p className="text-sm text-slate-600">{item.descriptionText}</p>
              </div>
            ),
          },
          {
            id: "slug",
            header: "Slug",
            accessor: (item) => <span className="text-slate-600">{item.slug}</span>,
            mobile: "hidden",
          },
          {
            id: "visibility",
            header: "可见性",
            accessor: (item) => <VisibilityBadge hidden={item.hidden} />,
            mobile: "hidden",
          },
          {
            id: "count",
            header: "文章数量",
            accessor: (item) => <span className="text-slate-600">{item._count.posts}</span>,
            mobile: "meta",
            mobileLabel: "文章数量",
          },
          {
            id: "description",
            header: "简介",
            accessor: (item) => <span className="text-slate-600">{item.descriptionText}</span>,
            mobile: "hidden",
          },
          {
            id: "actions",
            header: "操作",
            accessor: (item) => (
              <div className="flex justify-end gap-2">
                <Link
                  href={`/admin/series/${item.id}`}
                  className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-100"
                >
                  编辑
                </Link>
                <ToggleSeriesVisibilityButton seriesId={item.id} hidden={item.hidden} />
                <DeleteSeriesButton seriesId={item.id} seriesTitle={item.title} />
              </div>
            ),
            headerClassName: "text-right",
            cellClassName: "text-right",
            mobile: "meta",
            mobileLabel: "操作",
            mobileAccessor: (item) => (
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/admin/series/${item.id}`}
                  className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-100"
                >
                  编辑
                </Link>
                <ToggleSeriesVisibilityButton seriesId={item.id} hidden={item.hidden} />
                <DeleteSeriesButton seriesId={item.id} seriesTitle={item.title} />
              </div>
            ),
          },
        ]}
      />
    </div>
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
