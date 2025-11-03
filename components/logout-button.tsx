'use client';

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) {
        console.error("退出登录失败");
      }
      router.push("/admin/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
      disabled={loading}
    >
      {loading ? "正在退出..." : "退出登录"}
    </button>
  );
}
