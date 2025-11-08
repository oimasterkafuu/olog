import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { MarkdownViewer } from "@/components/markdown-viewer";
import { formatDiaryDate, formatWeekIdentifier } from "@/lib/diary-date";

async function getDiaryByDate(diaryDate: string) {
  return await prisma.diary.findFirst({
    where: {
      OR: [
        { diaryDate },
        { id: diaryDate }, // 支持通过 ID 访问
      ],
      status: "PUBLISHED",
    },
  });
}

export default async function DiaryDetailPage({ params }: { params: { date: string } }) {
  const diary = await getDiaryByDate(params.date);

  if (!diary || !diary.summaryMd) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* 返回链接 */}
      <div className="mb-6">
        <Link
          href="/diary"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回日记列表
        </Link>
      </div>

      {/* 文章头部 */}
      <header className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
          {diary.isWeeklySummary && (
            <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700">
              周总结
            </span>
          )}
          <span>{formatWeekIdentifier(diary.weekIdentifier)}</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-900">
          {diary.isWeeklySummary
            ? `${formatWeekIdentifier(diary.weekIdentifier)} 周总结`
            : formatDiaryDate(diary.diaryDate)}
        </h1>
        {diary.publishedAt && (
          <p className="mt-2 text-sm text-slate-500">
            发布于 {new Date(diary.publishedAt).toLocaleDateString("zh-CN", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        )}
      </header>

      {/* 文章内容 */}
      <article className="prose prose-slate max-w-none">
        <MarkdownViewer content={diary.summaryMd} />
      </article>

      {/* 底部导航 */}
      <footer className="mt-12 border-t border-slate-200 pt-6">
        <Link
          href="/diary"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回日记列表
        </Link>
      </footer>
    </div>
  );
}

export async function generateMetadata({ params }: { params: { date: string } }) {
  const diary = await getDiaryByDate(params.date);

  if (!diary) {
    return {
      title: "日记不存在",
    };
  }

  return {
    title: diary.isWeeklySummary
      ? `${formatWeekIdentifier(diary.weekIdentifier)} 周总结`
      : `${formatDiaryDate(diary.diaryDate)} 的日记`,
    description: diary.summaryMd?.slice(0, 150) || "日记内容",
  };
}

