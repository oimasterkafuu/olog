"use client";

import { useState } from "react";

interface RegenerateSummaryButtonProps {
  postId: string;
  onSuccess?: (summary: string) => void;
}

export function RegenerateSummaryButton({ postId, onSuccess }: RegenerateSummaryButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleRegenerate = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/posts/${postId}/regenerate-summary`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "摘要生成失败");
      }

      setSuccess("摘要已重新生成");
      if (onSuccess && data.data?.summary) {
        onSuccess(data.data.summary);
      }

      // 3 秒后刷新页面以显示最新摘要
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "摘要生成失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleRegenerate}
        disabled={loading}
        className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        title="使用 AI 重新生成文章摘要"
      >
        {loading ? "生成中..." : "重新生成"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}
    </div>
  );
}

