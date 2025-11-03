'use client';

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MdEditorResponsive } from "@/components/md-editor-responsive";
import { UploadAssetButton } from "@/components/upload-asset-button";
import { generateDefaultPostSlug } from "@/lib/slugs";

type Mode = "create" | "edit";

interface BasePostData {
  id?: string;
  title?: string;
  slug?: string;
  contentMd?: string;
  autoSummary?: boolean;
  hidden?: boolean;
}

interface SeriesOption {
  id: string;
  title: string;
}

interface PostEditorFormProps {
  mode: Mode;
  post?: BasePostData & { seriesId?: string | null };
  seriesOptions: SeriesOption[];
  disabled?: boolean;
}

export function PostEditorForm({ mode, post, seriesOptions, disabled = false }: PostEditorFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(() => post?.slug ?? generateDefaultPostSlug());
  const [content, setContent] = useState(post?.contentMd ?? "");
  const [autoSummary, setAutoSummary] = useState(post?.autoSummary ?? true);
  const [hidden, setHidden] = useState(post?.hidden ?? false);
  const [seriesId, setSeriesId] = useState<string | null>(post?.seriesId ?? null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const submitLabel = mode === "create" ? "创建草稿" : "保存修改";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (disabled) {
      return;
    }

    if (!title.trim() || !content.trim()) {
      setError("请填写完整的标题与正文内容");
      return;
    }

    setLoading(true);

    const normalizedTitle = title.trim();
    const normalizedSlug = slug.trim() || generateDefaultPostSlug();
    setSlug(normalizedSlug);

    const payload: Record<string, unknown> = {
      title: normalizedTitle,
      slug: normalizedSlug,
      contentMd: content,
      autoSummary,
      hidden,
    };

    try {
      const endpoint = mode === "create" ? "/api/posts" : `/api/posts/${post?.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          seriesId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "保存失败");
        return;
      }
      setSuccess("保存成功");
      if (mode === "create") {
        router.push(`/admin/posts/${data.data.id}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      setError("保存时发生错误，请稍后再试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="title">
            标题
          </label>
          <input
            id="title"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
            value={title}
            onChange={(e) => {
              if (disabled) return;
              setTitle(e.target.value);
            }}
            placeholder="请输入文章标题"
            required
            disabled={disabled}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="slug">
            Slug
          </label>
          <input
            id="slug"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
            value={slug}
            onChange={(e) => {
              if (disabled) return;
              setSlug(e.target.value);
            }}
            placeholder="post-1680000000000"
            disabled={disabled}
          />
          <p className="mt-1 text-xs text-slate-500">默认以 post-时间戳 命名，可按需修改。</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="series">
            所属系列
          </label>
          <select
            id="series"
            value={seriesId ?? ""}
            onChange={(e) => {
              if (disabled) return;
              setSeriesId(e.target.value ? e.target.value : null);
            }}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
            disabled={disabled}
          >
            <option value="">未加入系列</option>
            {seriesOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={autoSummary}
              onChange={(e) => {
                if (disabled) return;
                setAutoSummary(e.target.checked);
              }}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
              disabled={disabled}
            />
            发布时自动生成摘要
          </label>
          <p className="text-xs text-slate-500">可在发布流程中调用 AI 生成摘要（默认开启）。</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={hidden}
              onChange={(e) => {
                if (disabled) return;
                setHidden(e.target.checked);
              }}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
              disabled={disabled}
            />
            隐藏此文章
          </label>
          <p className="text-xs text-slate-500">隐藏后不会在首页和系列列表显示，但可通过直接链接访问。</p>
        </div>
        <p className="text-xs text-slate-500">关键词标签将在发布时由 AI 自动生成，无需手动维护。</p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">正文（Markdown）</label>
        <MdEditorResponsive
          value={content}
          onChange={(value) => {
            if (disabled) return;
            setContent(value);
          }}
          disabled={disabled}
        />
        <div className="mt-2">
          <UploadAssetButton
            postId={post?.id}
            onUploaded={(asset) => {
              if (disabled) return;
              setContent((prev) => `${prev}\n![](${asset.path})\n`);
            }}
            disabled={disabled}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          disabled={loading || disabled}
        >
          {loading ? "保存中..." : submitLabel}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/posts")}
          className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
        >
          返回列表
        </button>
      </div>
    </form>
  );
}
