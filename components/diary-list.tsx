"use client";

import { useState } from "react";
import Link from "next/link";
import { formatWeekIdentifier, formatDiaryDate } from "@/lib/diary-date";

interface DiaryItem {
  id: string;
  diaryDate: string;
  status: string;
  summaryMd: string | null;
  isWeeklySummary: boolean;
  publishedAt: string | null;
}

interface WeekGroup {
  weekIdentifier: string;
  diaries: DiaryItem[];
  weeklySummary?: DiaryItem;
}

interface DiaryListProps {
  weekGroups: WeekGroup[];
  showActions?: boolean;
  baseUrl?: string; // "/admin/diary" 或 "/diary"
  onDelete?: (diaryId: string) => Promise<void>;
}

export function DiaryList({ weekGroups, showActions = false, baseUrl = "/admin/diary", onDelete }: DiaryListProps) {
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  const toggleWeek = (weekId: string) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekId)) {
        next.delete(weekId);
      } else {
        next.add(weekId);
      }
      return next;
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PUBLISHED":
        return (
          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">
            已发布
          </span>
        );
      case "GENERATED":
        return (
          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700">
            已生成
          </span>
        );
      case "CHATTING":
        return (
          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
            对话中
          </span>
        );
      default:
        return null;
    }
  };

  if (weekGroups.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">还没有日记，开始记录你的生活吧！</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {weekGroups.map((group) => {
        const isExpanded = expandedWeeks.has(group.weekIdentifier);
        const regularDiaries = group.diaries.filter((d) => !d.isWeeklySummary);
        const publishedCount = regularDiaries.filter((d) => d.status === "PUBLISHED").length;

        return (
          <div key={group.weekIdentifier} className="rounded-lg border border-slate-200 bg-white">
            {/* 周标题栏 */}
            <button
              onClick={() => toggleWeek(group.weekIdentifier)}
              className="flex w-full items-center justify-between p-4 text-left transition hover:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <svg
                  className={`h-5 w-5 text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <div>
                  <h3 className="text-base font-medium text-slate-900">
                    {formatWeekIdentifier(group.weekIdentifier)}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {regularDiaries.length} 篇日记
                    {publishedCount > 0 && ` · ${publishedCount} 篇已发布`}
                    {group.weeklySummary && " · 已有周总结"}
                  </p>
                </div>
              </div>
            </button>

            {/* 展开的日记列表 */}
            {isExpanded && (
              <div className="border-t border-slate-100 p-4">
                <div className="space-y-2">
                  {/* 周总结 */}
                  {group.weeklySummary && (
                    <Link
                      href={`${baseUrl}/${group.weeklySummary.id}`}
                      className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition hover:border-slate-300 hover:bg-slate-100"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">📝 周总结</span>
                      </div>
                      {getStatusBadge(group.weeklySummary.status)}
                    </Link>
                  )}

                  {/* 日记列表 */}
                  {regularDiaries.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-500">本周还没有日记</p>
                  ) : (
                    regularDiaries.map((diary) => {
                      // 对话中的日记跳转到对话界面，其他跳转到编辑页面
                      const href = diary.status === "CHATTING" && baseUrl === "/admin/diary"
                        ? "/admin/diary/new"
                        : `${baseUrl}/${diary.id}`;
                      
                      return (
                        <div
                          key={diary.id}
                          className="flex items-center justify-between rounded border border-slate-100 px-3 py-2 text-sm transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          <Link href={href} className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-800">
                                {formatDiaryDate(diary.diaryDate)}
                              </span>
                            </div>
                          </Link>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(diary.status)}
                            {showActions && onDelete && (
                              <button
                                onClick={() => {
                                  if (confirm("确定要删除这篇日记吗？")) {
                                    onDelete(diary.id);
                                  }
                                }}
                                className="text-slate-400 hover:text-red-600"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

