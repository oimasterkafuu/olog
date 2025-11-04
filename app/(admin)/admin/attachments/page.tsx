"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ResponsiveTable, type ResponsiveTableColumn } from "@/components/responsive-table";

interface AttachmentPost {
  id: string;
  title: string;
  slug: string;
}

interface Attachment {
  id: string;
  sha256: string;
  ext: string;
  mime: string;
  size: number;
  path: string;
  refCount: number;
  createdAt: string;
  referencedBy: AttachmentPost[];
}

export default function AttachmentsPage() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadAttachments();
  }, []);

  async function loadAttachments() {
    try {
      setLoading(true);
      const res = await fetch("/api/attachments");
      const data = await res.json();
      
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "加载失败");
      }
      
      setAttachments(data.data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载附件列表失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(sha256: string) {
    if (!confirm("确定要删除此附件吗？此操作无法撤销。")) {
      return;
    }

    try {
      setDeletingId(sha256);
      const res = await fetch(`/api/attachments?sha256=${encodeURIComponent(sha256)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "删除失败");
      }
      
      // 重新加载列表
      await loadAttachments();
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除附件失败");
    } finally {
      setDeletingId(null);
    }
  }

  function toggleExpand(sha256: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(sha256)) {
        next.delete(sha256);
      } else {
        next.add(sha256);
      }
      return next;
    });
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const columns: ResponsiveTableColumn<Attachment>[] = [
    {
      id: "preview",
      header: "预览",
      mobile: "primary",
      accessor: (attachment) => {
        if (attachment.mime.startsWith("image/")) {
          return (
            <img
              src={attachment.path}
              alt="preview"
              className="h-16 w-16 rounded border border-slate-200 object-cover"
            />
          );
        }
        return (
          <div className="flex h-16 w-16 items-center justify-center rounded border border-slate-200 bg-slate-50 text-xs text-slate-500">
            {attachment.ext || "文件"}
          </div>
        );
      },
    },
    {
      id: "hash",
      header: "SHA256",
      mobile: "meta",
      accessor: (attachment) => (
        <div className="font-mono text-xs">
          <div className="font-medium text-slate-900">{attachment.sha256.substring(0, 8)}...</div>
          <div className="text-slate-500">.{attachment.ext}</div>
        </div>
      ),
    },
    {
      id: "info",
      header: "信息",
      mobile: "meta",
      accessor: (attachment) => (
        <div className="space-y-1 text-xs">
          <div className="text-slate-700">{formatFileSize(attachment.size)}</div>
          <div className="text-slate-500">{attachment.mime}</div>
        </div>
      ),
    },
    {
      id: "refCount",
      header: "引用数",
      mobile: "meta",
      accessor: (attachment) => (
        <div className="text-sm">
          <span className={attachment.refCount > 0 ? "text-slate-900 font-medium" : "text-slate-500"}>
            {attachment.refCount}
          </span>
        </div>
      ),
    },
    {
      id: "createdAt",
      header: "创建时间",
      mobile: "hidden",
      accessor: (attachment) => (
        <div className="text-xs text-slate-600">
          {new Date(attachment.createdAt).toLocaleString("zh-CN")}
        </div>
      ),
    },
    {
      id: "actions",
      header: "操作",
      mobile: "meta",
      accessor: (attachment) => {
        const isExpanded = expandedRows.has(attachment.sha256);
        const hasRefs = attachment.referencedBy.length > 0;

        return (
          <div className="flex flex-wrap gap-2">
            {hasRefs && (
              <button
                type="button"
                onClick={() => toggleExpand(attachment.sha256)}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 transition hover:bg-slate-100"
              >
                {isExpanded ? "收起引用" : `查看引用 (${attachment.referencedBy.length})`}
              </button>
            )}
            <a
              href={attachment.path}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 transition hover:bg-slate-100"
            >
              下载
            </a>
            <button
              type="button"
              onClick={() => handleDelete(attachment.sha256)}
              disabled={attachment.refCount > 0 || deletingId === attachment.sha256}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              title={attachment.refCount > 0 ? "请先删除引用此附件的所有文章" : "删除附件"}
            >
              {deletingId === attachment.sha256 ? "删除中..." : "删除"}
            </button>
          </div>
        );
      },
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">附件管理</h1>
          <p className="mt-1 text-sm text-slate-500">查看和管理所有上传的附件文件。</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-500">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">附件管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          共 {attachments.length} 个附件，
          总大小 {formatFileSize(attachments.reduce((sum, att) => sum + att.size, 0))}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-slate-300 bg-slate-100 p-3 text-sm text-slate-800">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <ResponsiveTable
          columns={columns}
          rows={attachments}
          getRowKey={(att) => att.sha256}
          emptyState="暂无附件"
        />
      </div>

      {/* 引用详情（扩展区域） */}
      {attachments.map((attachment) => {
        const isExpanded = expandedRows.has(attachment.sha256);
        if (!isExpanded || attachment.referencedBy.length === 0) return null;

        return (
          <div
            key={`refs-${attachment.sha256}`}
            className="rounded-lg border border-slate-200 bg-slate-50 p-4"
          >
            <h3 className="text-sm font-medium text-slate-900">
              引用此附件的文章 ({attachment.sha256.substring(0, 8)}...)
            </h3>
            <ul className="mt-3 space-y-2">
              {attachment.referencedBy.map((post) => (
                <li key={post.id} className="text-sm">
                  <Link
                    href={`/admin/posts/${post.id}`}
                    className="text-slate-700 hover:text-slate-900 hover:underline"
                  >
                    {post.title}
                  </Link>
                  <span className="ml-2 text-xs text-slate-500">({post.slug})</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-900">说明</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          <li>• 附件按内容 SHA256 哈希去重存储，相同内容的文件仅保存一份</li>
          <li>• 引用数为 0 的附件可以手动删除，删除后文件将从服务器移除</li>
          <li>• 引用数大于 0 的附件无法删除，请先删除引用该附件的所有文章</li>
          <li>• 删除文章时会自动解除对附件的引用，并清理无引用的文件</li>
        </ul>
      </div>
    </div>
  );
}

