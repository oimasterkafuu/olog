'use client';

import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";

type Mode = "create" | "edit";

interface SeriesBase {
  id?: string;
  title?: string;
  slug?: string;
  description?: string | null;
  hidden?: boolean;
}

interface SeriesPost {
  id: string;
  title: string;
  slug: string;
  status: "DRAFT" | "PUBLISHED";
  publishedAt: string | null;
}

interface SeriesFormProps {
  mode: Mode;
  series?: SeriesBase;
  posts?: SeriesPost[];
}

export function SeriesForm({ mode, series, posts = [] }: SeriesFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(series?.title ?? "");
  const [slug, setSlug] = useState(series?.slug ?? "");
  const [description, setDescription] = useState(series?.description ?? "");
  const [hidden, setHidden] = useState(series?.hidden ?? false);
  const [orderIds, setOrderIds] = useState(() => posts.map((post) => post.id));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // 自动保存草稿（仅在新建模式启用）
  const draftData = mode === "create" ? {
    title,
    slug,
    description,
    hidden,
    orderIds,
  } : null;

  const { savedData, clearSaved } = mode === "create"
    ? useAutoSave("draft-series-new", draftData!)
    : { savedData: null, clearSaved: () => {} };

  // 初始化时恢复草稿（仅新建模式）
  useEffect(() => {
    if (savedData && mode === "create") {
      // 仅在新建模式且表单为空时恢复
      if (!title && !slug) {
        setTitle(savedData.title || "");
        setSlug(savedData.slug || "");
        setDescription(savedData.description || "");
        setHidden(savedData.hidden ?? false);
        if (Array.isArray(savedData.orderIds)) {
          setOrderIds(savedData.orderIds);
        }
      }
    }
  }, [savedData, mode, title, slug]);

  const handleSubmit = useCallback(async (event?: React.FormEvent<HTMLFormElement>) => {
    if (event) {
      event.preventDefault();
    }
    if (loading) return;

    if (!title.trim() || !slug.trim()) {
      setError("请填写完整的标题与 Slug");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      if (mode === "create") {
        const res = await fetch("/api/series", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            slug: slug.trim(),
            description: description.trim() || null,
            hidden,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error ?? "创建失败");
          return;
        }
        // 清除自动保存的草稿（仅新建模式）
        if (mode === "create") {
          clearSaved();
        }
        router.push(`/admin/series/${data.data.id}`);
        router.refresh();
      } else if (series?.id) {
        const res = await fetch(`/api/series/${series.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            slug: slug.trim(),
            description: description.trim() || null,
            hidden,
            order: orderIds,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error ?? "保存失败");
          return;
        }
        setSuccess("保存成功");
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      setError("保存过程中出现错误");
    } finally {
      setLoading(false);
    }
  }, [mode, loading, title, slug, description, hidden, orderIds, series?.id, router, clearSaved]);

  // 快捷键 Ctrl/Cmd+S 保存
  useKeyboardShortcut('KeyS', () => {
    if (!loading) {
      handleSubmit();
    }
  }, { ctrl: true, meta: true });

  const movePost = (id: string, direction: "up" | "down") => {
    setOrderIds((prev) => {
      const index = prev.indexOf(id);
      if (index === -1) return prev;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const newOrder = [...prev];
      [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
      return newOrder;
    });
  };

  const orderedPosts = orderIds
    .map((id) => posts.find((post) => post.id === id))
    .filter((post): post is SeriesPost => Boolean(post));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="title">
            系列标题
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
            placeholder="请输入系列标题"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="slug">
            Slug
          </label>
          <input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
            placeholder="例如 frontend-basics"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="description">
          描述
        </label>
        <textarea
          id="description"
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
          placeholder="可选，用于介绍系列内容"
        />
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={hidden}
            onChange={(e) => setHidden(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
          />
          隐藏此系列
        </label>
        <p className="text-xs text-slate-500">隐藏后不会在首页顶部显示，但可通过直接链接访问；系列内的文章也不会在首页显示。</p>
      </div>

      {mode === "edit" && orderedPosts.length > 0 && (
        <div className="rounded border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">系列内文章排序</h2>
          <p className="mt-1 text-xs text-slate-500">调整顺序仅影响系列页展示，不会修改文章发布时间。</p>
          <ul className="mt-3 space-y-2 text-sm">
            {orderedPosts.map((post, index) => (
              <li
                key={post.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-100 px-3 py-2"
              >
                <div>
                  <p className="font-medium text-slate-800">{post.title}</p>
                  <p className="text-xs text-slate-500">
                    {post.slug} · {post.status === "PUBLISHED" ? "已发布" : "草稿"}
                    {post.publishedAt ? ` · 发布于 ${new Date(post.publishedAt).toLocaleDateString("zh-CN")}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => movePost(post.id, "up")}
                    disabled={index === 0}
                    className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
                  >
                    上移
                  </button>
                  <button
                    type="button"
                    onClick={() => movePost(post.id, "down")}
                    disabled={index === orderedPosts.length - 1}
                    className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
                  >
                    下移
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mode === "edit" && orderedPosts.length === 0 && (
        <p className="rounded border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          尚未有文章加入该系列，可在文章编辑页选择“所属系列”完成绑定。
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "保存中..." : mode === "create" ? "创建系列" : "保存修改"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/series")}
          className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
        >
          返回列表
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}
      </div>
    </form>
  );
}
