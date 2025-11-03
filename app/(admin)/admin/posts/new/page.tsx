import { PostEditorForm } from "@/components/post-editor-form";
import { prisma } from "@/lib/db";

export const metadata = {
  title: "新建文章",
};

async function getSeriesOptions() {
  const series = await prisma.series.findMany({
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });
  return series;
}

export default async function NewPostPage() {
  const seriesOptions = await getSeriesOptions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">新建文章</h1>
        <p className="mt-1 text-sm text-slate-500">填写标题与正文内容，保存草稿后可继续编辑或发布。</p>
      </div>
      <PostEditorForm mode="create" seriesOptions={seriesOptions} />
    </div>
  );
}
