'use client';

import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { MdEditorResponsive } from "@/components/md-editor-responsive";
import { UploadAssetButton } from "@/components/upload-asset-button";
import { generateDefaultPostSlug } from "@/lib/slugs";
import { calculateFileSHA256, extractExtension, generatePlaceholder } from "@/lib/client-hash";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";

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

interface PendingImage {
  sha256: string;
  file: File;
  ext: string;
  placeholder: string;
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
  
  // 仅在新建模式下使用
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  // 自动保存草稿（仅在新建模式启用）
  const draftData = mode === "create" ? {
    title,
    slug,
    content,
    autoSummary,
    hidden,
    seriesId,
  } : null;

  const autoSaveResult = useAutoSave(
    "draft-post-new", 
    mode === "create" ? draftData! : null
  );
  const { savedData, clearSaved } = mode === "create" 
    ? autoSaveResult
    : { savedData: null, clearSaved: () => {} };

  // 初始化时恢复草稿（仅新建模式）
  useEffect(() => {
    if (savedData && mode === "create") {
      // 仅在新建模式且表单为空时恢复
      if (!title && !content) {
        setTitle(savedData.title || "");
        setSlug(savedData.slug || generateDefaultPostSlug());
        setContent(savedData.content || "");
        setAutoSummary(savedData.autoSummary ?? true);
        setHidden(savedData.hidden ?? false);
        setSeriesId(savedData.seriesId ?? null);
      }
    }
  }, [savedData, mode, title, content]);

  const submitLabel = mode === "create" ? "创建草稿" : "保存修改";

  // 处理图片添加（粘贴/拖拽/点击上传）
  const handleImageAdd = async (file: File) => {
    if (disabled) return;

    if (mode === "create") {
      // 新建模式：添加到 pending 列表
      try {
        const sha256 = await calculateFileSHA256(file);
        const ext = extractExtension(file.name);
        const placeholder = generatePlaceholder(sha256, ext);

        // 检查是否已存在
        const exists = pendingImages.some(img => img.sha256 === sha256);
        if (exists) {
          // 如果已存在，直接插入占位符
          setContent((prev) => `${prev}\n![](${placeholder})\n`);
          return;
        }

        // 添加到 pending 列表
        const pendingImage: PendingImage = {
          sha256,
          file,
          ext,
          placeholder,
        };
        setPendingImages((prev) => [...prev, pendingImage]);

        // 插入占位符到 Markdown
        setContent((prev) => `${prev}\n![](${placeholder})\n`);
      } catch (err) {
        console.error('Failed to process image:', err);
        setError("图片处理失败，请重试");
      }
    } else if (mode === "edit" && post?.id) {
      // 编辑模式：直接上传到服务器
      setUploadingImages(true);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("postId", post.id);
        
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const data = await res.json();
        
        if (!res.ok || !data.ok) {
          setError(data.error ?? "上传失败");
          return;
        }
        
        // 插入真实 URL 到 Markdown
        setContent((prev) => `${prev}\n![](${data.data.path})\n`);
      } catch (err) {
        console.error('Failed to upload image:', err);
        setError("上传图片失败，请重试");
      } finally {
        setUploadingImages(false);
      }
    }
  };

  // 上传所有 pending 图片
  const uploadPendingImages = async (postId: string): Promise<Map<string, string>> => {
    const urlMap = new Map<string, string>();
    
    for (const pendingImage of pendingImages) {
      try {
        const formData = new FormData();
        formData.append('file', pendingImage.file);
        formData.append('postId', postId);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          console.error('Failed to upload image:', data.error);
          continue;
        }

        // 记录映射：placeholder -> real URL
        urlMap.set(pendingImage.placeholder, data.data.path);
      } catch (err) {
        console.error('Error uploading image:', err);
      }
    }

    return urlMap;
  };

  // 替换 Markdown 中的占位符
  const replacePlaceholders = (markdown: string, urlMap: Map<string, string>): string => {
    let result = markdown;
    urlMap.forEach((realUrl, placeholder) => {
      // 使用正则全局替换
      const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escapedPlaceholder, 'g'), realUrl);
    });
    return result;
  };

  const handleSubmit = useCallback(async (event?: React.FormEvent<HTMLFormElement>) => {
    if (event) {
      event.preventDefault();
    }
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
      if (mode === "create") {
        // 创建模式：先创建文章，再上传图片，最后更新内容
        const res = await fetch("/api/posts", {
          method: "POST",
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

        const postId = data.data.id;

        // 如果有 pending 图片，上传并替换占位符
        if (pendingImages.length > 0) {
          setUploadingImages(true);
          const urlMap = await uploadPendingImages(postId);
          
          if (urlMap.size > 0) {
            const updatedContent = replacePlaceholders(content, urlMap);
            
            // 更新文章内容
            const updateRes = await fetch(`/api/posts/${postId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contentMd: updatedContent,
              }),
            });

            if (!updateRes.ok) {
              console.error('Failed to update content after image upload');
            }
          }
          setUploadingImages(false);
        }

        setSuccess("保存成功");
        // 清除自动保存的草稿（仅新建模式）
        if (mode === "create") {
          clearSaved();
        }
        router.push(`/admin/posts/${postId}`);
      } else {
        // 编辑模式：直接保存
        const endpoint = `/api/posts/${post?.id}`;
        const res = await fetch(endpoint, {
          method: "PATCH",
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
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      setError("保存时发生错误，请稍后再试");
    } finally {
      setLoading(false);
    }
  }, [mode, disabled, title, content, autoSummary, hidden, seriesId, slug, post?.id, pendingImages, router, clearSaved, uploadPendingImages]);

  // 快捷键 Ctrl/Cmd+S 保存
  useKeyboardShortcut('KeyS', () => {
    if (!disabled && !loading) {
      handleSubmit();
    }
  }, { ctrl: true, meta: true });

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
          onImagePaste={handleImageAdd}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {mode === "create" && (
            <>
              <UploadAssetButton
                onFileSelected={handleImageAdd}
                disabled={disabled}
              />
              {pendingImages.length > 0 && (
                <p className="text-xs text-slate-600">
                  待上传图片：{pendingImages.length} 张（保存草稿后自动上传）
                </p>
              )}
              <p className="text-xs text-slate-500">
                支持点击上传、粘贴或拖拽图片到编辑器
              </p>
            </>
          )}
          {mode === "edit" && (
            <UploadAssetButton
              postId={post?.id}
              onUploaded={(asset) => {
                if (disabled) return;
                setContent((prev) => `${prev}\n![](${asset.path})\n`);
              }}
              disabled={disabled}
            />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          disabled={loading || uploadingImages || disabled}
        >
          {uploadingImages ? "上传图片中..." : loading ? "保存中..." : submitLabel}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/posts")}
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
