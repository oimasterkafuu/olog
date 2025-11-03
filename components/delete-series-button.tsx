'use client';

import { useRouter } from "next/navigation";
import { useState } from "react";

interface DeleteSeriesButtonProps {
  seriesId: string;
  seriesTitle: string;
}

export function DeleteSeriesButton({ seriesId, seriesTitle }: DeleteSeriesButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (loading) return;
    const confirmed = window.confirm(`确认删除系列 “${seriesTitle}”？其下文章将保留，但不再属于该系列。`);
    if (!confirmed) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/series/${seriesId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        window.alert(data.error ?? "删除失败");
        return;
      }
      router.refresh();
    } catch (error) {
      console.error(error);
      window.alert("删除过程中出现错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="rounded border border-red-200 px-3 py-1 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-50"
      disabled={loading}
    >
      {loading ? "删除中" : "删除"}
    </button>
  );
}
