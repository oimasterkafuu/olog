import { SeriesForm } from "@/components/series-form";

export const metadata = {
  title: "新建系列",
};

export default function NewSeriesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">新建系列</h1>
        <p className="mt-1 text-sm text-slate-500">为相关主题的文章创建一个系列，并在编辑页绑定文章。</p>
      </div>
      <SeriesForm mode="create" />
    </div>
  );
}
