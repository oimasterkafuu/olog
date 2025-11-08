"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { DiaryEditor } from "@/components/diary-editor";
import { formatDiaryDate } from "@/lib/diary-date";

interface Diary {
  id: string;
  diaryDate: string;
  status: string;
  summaryMd: string | null;
  isWeeklySummary: boolean;
  weekIdentifier: string;
  publishedAt: string | null;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    createdAt: string;
  }>;
}

export default function DiaryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [diary, setDiary] = useState<Diary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [content, setContent] = useState("");
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  // 加载日记数据
  useEffect(() => {
    const loadDiary = async () => {
      try {
        const res = await fetch(`/api/diary/${id}`);
        if (!res.ok) {
          const { error } = await res.json();
          throw new Error(error || "加载日记失败");
        }

        const { data } = await res.json();
        setDiary(data.diary);
        setContent(data.diary.summaryMd || "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    };

    loadDiary();
  }, [id]);

  // 保存日记
  const handleSave = async () => {
    if (!diary || saving) return;

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/diary/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summaryMd: content }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || "保存失败");
      }

      const { data } = await res.json();
      setDiary(data.diary);
      setMessage({ type: "success", text: "保存成功" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  // 发布日记
  const handlePublish = async () => {
    if (!diary || publishing || !content.trim()) return;

    setPublishing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/diary/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diaryId: id }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || "发布失败");
      }

      setMessage({ type: "success", text: "发布成功" });
      setTimeout(() => {
        router.push("/admin/diary");
        router.refresh(); // 强制刷新服务端数据
      }, 500);
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "发布失败" });
    } finally {
      setPublishing(false);
    }
  };

  // 删除日记
  const handleDelete = async () => {
    if (!diary || deleting) return;

    if (!confirm("确定要删除这篇日记吗？此操作无法恢复。")) {
      return;
    }

    setDeleting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/diary/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || "删除失败");
      }

      setMessage({ type: "success", text: "删除成功" });
      setTimeout(() => {
        router.push("/admin/diary");
        router.refresh(); // 强制刷新服务端数据
      }, 500);
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "删除失败" });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-slate-500">加载中...</p>
      </div>
    );
  }

  if (error || !diary) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error || "日记不存在"}</p>
        </div>
        <Link
          href="/admin/diary"
          className="inline-block rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-100"
        >
          返回列表
        </Link>
      </div>
    );
  }

  const getStatusBadge = () => {
    switch (diary.status) {
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
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">
            {diary.isWeeklySummary ? "周总结" : formatDiaryDate(diary.diaryDate)}
          </h1>
          {getStatusBadge()}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {diary.isWeeklySummary ? `${diary.weekIdentifier} 周总结` : `日记 · ${diary.diaryDate}`}
        </p>
      </div>

      {/* 编辑器 */}
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <DiaryEditor
          value={content}
          onChange={setContent}
          disabled={diary.status === "PUBLISHED"}
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || diary.status === "PUBLISHED"}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存"}
        </button>
        <button
          onClick={handlePublish}
          disabled={publishing || !content.trim() || diary.status === "PUBLISHED"}
          className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
        >
          {publishing ? "发布中..." : diary.status === "PUBLISHED" ? "已发布" : "发布"}
        </button>
        {!diary.isWeeklySummary && diary.status !== "PUBLISHED" && (
          <Link
            href={`/admin/diary/${id}/chat`}
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
          >
            进入对话
          </Link>
        )}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded border border-red-300 px-4 py-2 text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-50"
        >
          {deleting ? "删除中..." : "删除"}
        </button>
        <Link
          href="/admin/diary"
          className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
        >
          返回列表
        </Link>
        {message && (
          <p className={`text-sm ${message.type === "error" ? "text-red-600" : "text-green-600"}`}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}

