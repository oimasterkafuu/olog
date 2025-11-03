'use client';

import { useRouter } from "next/navigation";
import { useState } from "react";

interface TogglePostVisibilityButtonProps {
  postId: string;
  hidden: boolean;
}

export function TogglePostVisibilityButton({ postId, hidden }: TogglePostVisibilityButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    if (loading) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: !hidden }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error ?? "切换失败");
        return;
      }

      router.refresh();
    } catch (err) {
      console.error(err);
      alert("切换失败，请稍后再试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
      title={hidden ? "点击显示" : "点击隐藏"}
    >
      {loading ? "..." : hidden ? "显示" : "隐藏"}
    </button>
  );
}

