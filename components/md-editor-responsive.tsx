'use client';

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import type { MDEditorProps } from "@uiw/react-md-editor";
import { useIsMobile } from "@/hooks/use-media-query";
import { queueMathJaxTypeset } from "@/lib/mathjax";

import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

type EditorMode = "edit" | "preview" | "live";

interface MdEditorResponsiveProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  desktopHeight?: number;
  mobileHeight?: number;
  previewOptions?: MDEditorProps["previewOptions"];
  textareaProps?: MDEditorProps["textareaProps"];
  onImagePaste?: (file: File) => void;
}

export function MdEditorResponsive({
  value,
  onChange,
  disabled = false,
  className,
  desktopHeight = 520,
  mobileHeight = 360,
  previewOptions,
  textareaProps,
  onImagePaste,
}: MdEditorResponsiveProps) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<EditorMode>("live");

  useEffect(() => {
    if (isMobile && mode === "live") {
      setMode("edit");
    }
  }, [isMobile, mode]);

  useEffect(() => {
    if (mode === "edit") {
      return;
    }
    queueMathJaxTypeset();
  }, [mode, value]);

  const editorHeight = isMobile ? mobileHeight : desktopHeight;
  const mergedPreviewOptions =
    previewOptions ?? ({
      remarkPlugins: [remarkGfm],
      rehypePlugins: [rehypeSanitize, rehypeHighlight],
    } satisfies NonNullable<MDEditorProps["previewOptions"]>);

  // 处理粘贴事件
  const handlePaste = (event: React.ClipboardEvent) => {
    if (!onImagePaste || disabled) return;

    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          onImagePaste(file);
        }
        break;
      }
    }
  };

  // 处理拖拽事件
  const handleDrop = (event: React.DragEvent) => {
    if (!onImagePaste || disabled) return;

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        event.preventDefault();
        onImagePaste(file);
        break;
      }
    }
  };

  const mergedTextareaProps = {
    ...textareaProps,
    readOnly: disabled ? true : textareaProps?.readOnly,
    onPaste: handlePaste,
    onDrop: handleDrop,
  } satisfies NonNullable<MDEditorProps["textareaProps"]>;

  const controls: { label: string; value: EditorMode; hiddenOnMobile?: boolean }[] = [
    { label: "编辑", value: "edit" },
    { label: "预览", value: "preview" },
    { label: "分屏", value: "live", hiddenOnMobile: true },
  ];

  return (
    <div className={className ? `space-y-3 ${className}` : "space-y-3"}>
      <div className="flex flex-wrap items-center gap-2">
        {controls.map((control) => {
          if (isMobile && control.hiddenOnMobile) {
            return null;
          }
          const active = mode === control.value;
          return (
            <button
              key={control.value}
              type="button"
              onClick={() => setMode(control.value)}
              disabled={disabled || (isMobile && control.value === "live")}
              className={`rounded-full px-3 py-1 text-sm transition ${
                active
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
            >
              {control.label}
            </button>
          );
        })}
        <span className="ml-auto text-xs text-slate-500">
          {isMobile ? "移动端默认为单栏编辑" : "支持分屏同步预览"}
        </span>
      </div>
      <div data-color-mode="light" className="overflow-hidden rounded border border-slate-200 shadow-sm">
        <MDEditor
          value={value}
          preview={mode}
          onChange={(val) => {
            if (disabled) return;
            onChange(val ?? "");
          }}
          height={editorHeight}
          hideToolbar={isMobile}
          previewOptions={mergedPreviewOptions}
          textareaProps={mergedTextareaProps}
          visibleDragbar={!isMobile && mode === "live"}
        />
      </div>
    </div>
  );
}
