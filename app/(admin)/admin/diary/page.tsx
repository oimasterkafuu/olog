import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getDiaryDate } from "@/lib/diary-date";
import { DiaryList } from "@/components/diary-list";

async function getDiaryData() {
  // 获取所有日记，按周分组
  const allDiaries = await prisma.diary.findMany({
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

export default async function AdminDiaryPage() {
  const session = await getSession();
  if (!session.userId) {
    redirect("/admin/login");
  }

  const weekGroups = await getDiaryData();
  const todayDate = getDiaryDate();

  // 检查今天是否已有日记
  const todayDiary = await prisma.diary.findUnique({
    where: { diaryDate: todayDate },
  });

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">日记管理</h1>
          <p className="mt-1 text-sm text-slate-500">记录每一天的生活点滴</p>
        </div>
        <Link
          href={todayDiary ? `/admin/diary/${todayDiary.id}` : "/admin/diary/new"}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          {todayDiary ? "继续今天的日记" : "开始今天的日记"}
        </Link>
      </div>

      {/* 日记列表 */}
      <DiaryList weekGroups={weekGroups} showActions={false} baseUrl="/admin/diary" />
    </div>
  );
}

