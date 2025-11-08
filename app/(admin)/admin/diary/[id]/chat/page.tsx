"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { DiaryChatInterface } from "@/components/diary-chat-interface";
import { MarkdownViewer } from "@/components/markdown-viewer";
import { formatDiaryDate } from "@/lib/diary-date";

interface Message {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
}

interface Diary {
  id: string;
  diaryDate: string;
  status: string;
  summaryMd: string | null;
  messages: Message[];
}

export default function DiaryChatPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [diary, setDiary] = useState<Diary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  // 加载日记数据
  useEffect(() => {
    const loadDiary = async () => {
      try {
        const res = await fetch(`/api/diary/${id}`);
        if (!res.ok) {
          const { error } = await res.json();
          throw new Error(error || "加载日记失败");
        }

        const { data } = await res.json();
        setDiary(data.diary);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    };

    loadDiary();
  }, [id]);

  // 发送消息
  const handleSendMessage = useCallback(
    async (message: string) => {
      if (!diary) return;

      // 立即显示用户消息（临时 ID）
      const tempUserMessage: Message = {
        id: `temp-user-${Date.now()}`,
        role: "USER",
        content: message,
        createdAt: new Date().toISOString(),
      };

      setDiary((prev) =>
        prev
          ? {
              ...prev,
              messages: [...prev.messages, tempUserMessage],
            }
          : null
      );

      try {
        const res = await fetch("/api/diary/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ diaryId: diary.id, userMessage: message }),
        });

        if (!res.ok) {
          const { error } = await res.json();
          // 如果失败，移除临时消息
          setDiary((prev) =>
            prev
              ? {
                  ...prev,
                  messages: prev.messages.filter((m) => m.id !== tempUserMessage.id),
                }
              : null
          );
          throw new Error(error || "发送消息失败");
        }

        const { data } = await res.json();

        // 用实际的消息替换临时消息，并添加 AI 回复
        setDiary((prev) =>
          prev
            ? {
                ...prev,
                messages: [
                  ...prev.messages.filter((m) => m.id !== tempUserMessage.id),
                  data.userMessage,
                  data.assistantMessage,
                ],
              }
            : null
        );
      } catch (err) {
        setMessage({ type: "error", text: err instanceof Error ? err.message : "发送消息失败" });
      }
    },
    [diary]
  );

  // 生成日记文章
  const handleGenerate = async () => {
    if (!diary || generating) return;

    if (diary.messages.length < 3) {
      setMessage({ type: "error", text: "请至少进行几轮对话后再生成日记" });
      return;
    }

    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/diary/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diaryId: diary.id }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || "生成日记失败");
      }

      const { data } = await res.json();
      setDiary((prev) => (prev ? { ...prev, ...data.diary } : null));
      setMessage({ type: "success", text: "日记生成成功" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "生成日记失败" });
    } finally {
      setGenerating(false);
    }
  };

  // 发布日记
  const handlePublish = async () => {
    if (!diary || publishing || !diary.summaryMd) return;

    setPublishing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/diary/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diaryId: diary.id }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || "发布日记失败");
      }

      setMessage({ type: "success", text: "发布成功" });
      setTimeout(() => {
        router.push("/admin/diary");
        router.refresh();
      }, 500);
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "发布日记失败" });
    } finally {
      setPublishing(false);
    }
  };

  // 清空对话
  const handleClearChat = async () => {
    if (!diary || clearing) return;

    setClearing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/diary/${diary.id}/clear`, {
        method: "POST",
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || "清空对话失败");
      }

      const { data } = await res.json();
      setDiary(data.diary);
      setMessage({ type: "success", text: "对话已清空，AI 已重新开场" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "清空对话失败" });
    } finally {
      setClearing(false);
    }
  };

  // 删除日记
  const handleDelete = async () => {
    if (!diary) return;

    if (!confirm("确定要删除这篇日记吗？此操作无法恢复。")) {
      return;
    }

    setMessage(null);
    try {
      const res = await fetch(`/api/diary/${diary.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || "删除失败");
      }

      setMessage({ type: "success", text: "删除成功" });
      setTimeout(() => {
        router.push("/admin/diary");
        router.refresh();
      }, 500);
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "删除失败" });
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-slate-500">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
        <Link
          href="/admin/diary"
          className="inline-block rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
        >
          返回列表
        </Link>
      </div>
    );
  }

  if (!diary) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {formatDiaryDate(diary.diaryDate)}
          </h1>
          <p className="mt-1 text-sm text-slate-500">日记对话 · {diary.diaryDate}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating || diary.status === "PUBLISHED"}
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
          >
            {generating ? "生成中..." : diary.summaryMd ? "重新生成" : "生成日记"}
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing || !diary.summaryMd || diary.status === "PUBLISHED"}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {publishing ? "发布中..." : diary.status === "PUBLISHED" ? "已发布" : "发布"}
          </button>
          <Link
            href={`/admin/diary/${id}`}
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
          >
            编辑内容
          </Link>
          <button
            onClick={handleDelete}
            className="rounded border border-red-300 px-4 py-2 text-sm text-red-700 transition hover:bg-red-50"
          >
            删除日记
          </button>
          <Link
            href="/admin/diary"
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
          >
            返回列表
          </Link>
          {message && (
            <p className={`text-sm ${message.type === "error" ? "text-red-600" : "text-green-600"}`}>
              {message.text}
            </p>
          )}
        </div>
      </div>

      {/* 双栏布局：左侧对话，右侧预览 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 对话界面 */}
        <div className="rounded-lg border border-slate-200 bg-white" style={{ height: "600px" }}>
          <div className="border-b border-slate-200 p-4">
            <h2 className="text-lg font-medium text-slate-900">对话记录</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              分享你今天的经历、感受和想法
            </p>
          </div>
          <div style={{ height: "calc(100% - 72px)" }}>
            <DiaryChatInterface
              messages={diary.messages}
              onSendMessage={handleSendMessage}
              onClearChat={handleClearChat}
              disabled={diary.status === "PUBLISHED"}
              maxRounds={20}
            />
          </div>
        </div>

        {/* 日记预览 */}
        <div className="rounded-lg border border-slate-200 bg-white p-4" style={{ height: "600px", overflowY: "auto" }}>
          <div className="mb-4 border-b border-slate-200 pb-4">
            <h2 className="text-lg font-medium text-slate-900">日记预览</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {diary.summaryMd ? "生成的日记文章" : '完成对话后点击"生成日记"'}
            </p>
          </div>
          {diary.summaryMd ? (
            <MarkdownViewer content={diary.summaryMd} />
          ) : (
            <div className="flex h-64 items-center justify-center">
              <p className="text-sm text-slate-500">日记内容将在生成后显示</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

