import { prisma } from "@/lib/db";
import { DiaryList } from "@/components/diary-list";

async function getPublishedDiaryData() {
  // 获取所有已发布的日记，按周分组
  const allDiaries = await prisma.diary.findMany({
    where: {
      status: "PUBLISHED",
    },
    orderBy: [{ weekIdentifier: "desc" }, { diaryDate: "asc" }],
    select: {
      id: true,
      diaryDate: true,
      status: true,
      summaryMd: true,
      isWeeklySummary: true,
      weekIdentifier: true,
      publishedAt: true,
    },
  });

  // 转换 Date 为 string
  const serializedDiaries = allDiaries.map((d) => ({
    ...d,
    publishedAt: d.publishedAt?.toISOString() ?? null,
  }));

  // 按周分组
  const weekGroups = new Map<
    string,
    {
      weekIdentifier: string;
      diaries: typeof serializedDiaries;
      weeklySummary?: (typeof serializedDiaries)[0];
    }
  >();

  for (const diary of serializedDiaries) {
    if (!weekGroups.has(diary.weekIdentifier)) {
      weekGroups.set(diary.weekIdentifier, {
        weekIdentifier: diary.weekIdentifier,
        diaries: [],
      });
    }

    const group = weekGroups.get(diary.weekIdentifier)!;
    if (diary.isWeeklySummary) {
      group.weeklySummary = diary;
    } else {
      group.diaries.push(diary);
    }
  }

  return Array.from(weekGroups.values());
}

export default async function DiaryPage() {
  const weekGroups = await getPublishedDiaryData();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-900">日记</h1>
        <p className="mt-2 text-slate-600">记录生活的点点滴滴</p>
      </div>

      {/* 日记列表 */}
      <DiaryList weekGroups={weekGroups} showActions={false} baseUrl="/diary" />
    </div>
  );
}

export const metadata = {
  title: "日记",
  description: "记录生活的点点滴滴",
};

