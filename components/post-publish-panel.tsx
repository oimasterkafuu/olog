'use client';

import { useRouter } from "next/navigation";
import { useState } from "react";

interface PostPublishPanelProps {
  postId: string;
  status: "DRAFT" | "PUBLISHED";
  autoSummary: boolean;
  slug: string;
  publishedAt?: string | null;
  onPublishingChange?: (publishing: boolean) => void;
}

export function PostPublishPanel({
  postId,
  status,
  autoSummary,
  slug,
  publishedAt,
  onPublishingChange,
}: PostPublishPanelProps) {
  const router = useRouter();
  const [needSummary, setNeedSummary] = useState(autoSummary);
  const [busyAction, setBusyAction] = useState<"publish" | "rebuild" | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "warning" | "">("");

  const setFeedback = (type: "success" | "error" | "warning" | "", text: string) => {
    setMessageType(type);
    setMessage(text);
  };

  const handlePublish = async () => {
    if (busyAction || status !== "DRAFT") return;
    setBusyAction("publish");
    onPublishingChange?.(true);
    setFeedback("", "");
    try {
      const res = await fetch(`/api/posts/${postId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ needSummary }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setFeedback("error", data.error ?? "发布失败");
        return;
      }
      if (data.data.warning) {
        setFeedback("warning", data.data.warning as string);
      } else {
        setFeedback("success", "发布成功");
      }
      router.refresh();
    } catch (error) {
      console.error(error);
      setFeedback("error", "发布过程中出现错误");
    } finally {
      setBusyAction(null);
      onPublishingChange?.(false);
    }
  };

  const handleRebuild = async () => {
    if (busyAction) return;
    setBusyAction("rebuild");
    setFeedback("", "");
    try {
      const res = await fetch(`/api/posts/${postId}/assets/rebuild`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setFeedback("error", data.error ?? "重建附件引用失败");
        return;
      }
      setFeedback("success", "附件引用已重建");
      router.refresh();
    } catch (error) {
      console.error(error);
      setFeedback("error", "重建过程中出现错误");
    } finally {
      setBusyAction(null);
    }
  };

  const publicUrl = `/post/${slug}`;
  const formattedPublishedAt = publishedAt ? new Date(publishedAt).toLocaleString("zh-CN", { hour12: false }) : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-slate-500">当前状态</p>
          <p className="text-lg font-semibold text-slate-900">
            {status === "PUBLISHED" ? "已发布" : "草稿"}
            {formattedPublishedAt && status === "PUBLISHED" && (
              <span className="ml-2 text-sm font-normal text-slate-500">发布于 {formattedPublishedAt}</span>
            )}
          </p>
          <p className="text-sm text-slate-500">
            公开地址：
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-slate-900 underline">
              {publicUrl}
            </a>
          </p>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={needSummary}
              onChange={(event) => {
                if (status !== "DRAFT" || busyAction === "publish") return;
                setNeedSummary(event.target.checked);
              }}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
              disabled={status !== "DRAFT" || busyAction === "publish"}
            />
            发布时生成摘要
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePublish}
              disabled={status !== "DRAFT" || busyAction === "publish"}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busyAction === "publish" ? "发布中..." : "发布文章"}
            </button>
            <button
              type="button"
              onClick={handleRebuild}
              disabled={Boolean(busyAction)}
              className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busyAction === "rebuild" ? "处理中..." : "重建附件引用"}
            </button>
          </div>
        </div>
      </div>
      {message && (
        <p
          className={`mt-3 text-sm ${
            messageType === "success"
              ? "text-green-600"
              : messageType === "warning"
              ? "text-amber-600"
              : messageType === "error"
              ? "text-red-600"
              : "text-slate-600"
          }`}
        >
          {message}
        </p>
      )}
      {status !== "DRAFT" && (
        <p className="mt-2 text-xs text-slate-500">如需重新发布，请先将文章复制为草稿或创建新文章。</p>
      )}
    </div>
  );
}
