'use client';

import { useRouter } from "next/navigation";
import { useState } from "react";

interface DeletePostButtonProps {
  postId: string;
  postTitle: string;
}

export function DeletePostButton({ postId, postTitle }: DeletePostButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const handleDelete = async () => {
    if (loading) return;
    const confirmed = window.confirm(`确认删除文章 “${postTitle}”？该操作不可恢复。`);
    if (!confirmed) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
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
