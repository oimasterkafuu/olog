"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

interface DiaryEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function DiaryEditor({ value, onChange, disabled = false }: DiaryEditorProps) {
  const [wordCount, setWordCount] = useState(0);

  useEffect(() => {
    // 计算中文字符数（不包括 Markdown 标记）
    const plainText = value
      .replace(/[#*_~`[\]()]/g, "") // 移除 Markdown 标记
      .replace(/\s+/g, "") // 移除空白字符
      .trim();
    setWordCount(plainText.length);
  }, [value]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">日记内容</label>
        <div className="text-xs text-slate-500">
          字数：{wordCount} / 目标 400 字
          {wordCount < 350 && wordCount > 0 && (
            <span className="ml-2 text-amber-600">（建议 350-450 字）</span>
          )}
          {wordCount > 450 && <span className="ml-2 text-amber-600">（稍微有点长了）</span>}
        </div>
      </div>
      <div data-color-mode="light">
        <MDEditor
          value={value}
          onChange={(val) => onChange(val || "")}
          preview="live"
          height={500}
          enableScroll={true}
          textareaProps={{
            disabled,
            placeholder: "在这里编辑你的日记...",
          }}
        />
      </div>
    </div>
  );
}

