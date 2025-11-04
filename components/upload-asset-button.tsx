'use client';

import { useState, useRef } from "react";

interface UploadAssetButtonProps {
  postId?: string;
  onUploaded?: (asset: { sha256: string; path: string; mime: string; size: number }) => void;
  onFileSelected?: (file: File) => void;
  disabled?: boolean;
}

export function UploadAssetButton({ postId, onUploaded, onFileSelected, disabled = false }: UploadAssetButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handlePick = () => {
    if (disabled || loading) return;
    inputRef.current?.click();
  };

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled || loading) return;
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    
    // 如果提供了 onFileSelected 回调（创建模式），直接返回文件
    if (onFileSelected) {
      onFileSelected(file);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      return;
    }
    
    // 否则上传到服务器（编辑模式）
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (postId) {
        form.append("postId", postId);
      }
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "上传失败");
        return;
      }
      if (onUploaded) {
        onUploaded(data.data);
      }
    } catch (err) {
      console.error(err);
      setError("上传过程中出现错误");
    } finally {
      setLoading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleChange}
        accept="image/*"
        disabled={disabled}
      />
      <button
        type="button"
        onClick={handlePick}
        className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
        disabled={loading || disabled}
      >
        {loading ? "上传中..." : "上传图片"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
