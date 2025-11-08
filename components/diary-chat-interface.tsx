"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
}

interface DiaryChatInterfaceProps {
  messages: Message[];
  onSendMessage: (message: string) => Promise<void>;
  disabled?: boolean;
  onClearChat?: () => Promise<void>;
  maxRounds?: number;
}

export function DiaryChatInterface({ 
  messages, 
  onSendMessage, 
  disabled = false,
  onClearChat,
  maxRounds = 20,
}: DiaryChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 计算当前轮次
  const userMessageCount = messages.filter((m) => m.role === "USER").length;
  const currentRound = userMessageCount;
  const remainingRounds = maxRounds - userMessageCount;
  const isMaxRoundsReached = userMessageCount >= maxRounds;

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 自动聚焦输入框
  useEffect(() => {
    if (!sending && !disabled) {
      inputRef.current?.focus();
    }
  }, [sending, disabled]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending || disabled || isMaxRoundsReached) return;

    const message = input.trim();
    setInput("");
    setSending(true);

    try {
      await onSendMessage(message);
    } finally {
      setSending(false);
    }
  };

  const handleClearChat = async () => {
    if (!onClearChat || clearing) return;
    
    if (!confirm("确定要清空所有对话记录吗？此操作无法恢复。")) {
      return;
    }

    setClearing(true);
    try {
      await onClearChat();
    } finally {
      setClearing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handleSubmit(e as any);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            开始你的日记对话...
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "USER" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  msg.role === "USER"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-900"
                }`}
              >
                <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg bg-slate-100 px-4 py-2">
              <p className="text-sm text-slate-500">正在思考...</p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-4">
        {/* 轮次和清空按钮 */}
        {messages.length > 0 && (
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {isMaxRoundsReached ? (
                <span className="font-medium text-amber-600">已达到对话上限（{maxRounds}轮）</span>
              ) : (
                <span>
                  第 {currentRound}/{maxRounds} 轮
                  {remainingRounds <= 5 && remainingRounds > 0 && (
                    <span className="ml-1 text-amber-600">（还剩 {remainingRounds} 轮）</span>
                  )}
                </span>
              )}
            </div>
            {onClearChat && (
              <button
                type="button"
                onClick={handleClearChat}
                disabled={clearing || messages.length === 0}
                className="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50"
              >
                {clearing ? "清空中..." : "清空对话"}
              </button>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isMaxRoundsReached
                ? "已达到对话上限，请生成日记或清空对话"
                : "分享今天发生的事情...（Enter 发送，Shift+Enter 换行）"
            }
            disabled={disabled || sending || isMaxRoundsReached}
            className="flex-1 resize-none rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
            rows={3}
          />
          <button
            type="submit"
            disabled={disabled || sending || !input.trim() || isMaxRoundsReached}
            className="self-end rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {sending ? "发送中..." : "发送"}
          </button>
        </div>
        {!isMaxRoundsReached && (
          <p className="mt-1 text-xs text-slate-500">
            提示：按 Enter 发送，Shift+Enter 换行
          </p>
        )}
      </form>
    </div>
  );
}

