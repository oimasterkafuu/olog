import Link from "next/link";
import type { ReactNode } from "react";
import { MarkdownViewer } from "@/components/markdown-viewer";

interface PostCardProps {
  title: string;
  href: string;
  publishedAt: Date | string | null;
  summary?: string | null;
  tags?: string[];
  leading?: ReactNode;
  summaryFallback?: string;
  className?: string;
}

export function PostCard({
  title,
  href,
  publishedAt,
  summary,
  tags,
  leading,
  summaryFallback,
  className,
}: PostCardProps) {
  const responsiveClassName = "rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5";
  const containerClassName = className ? `${responsiveClassName} ${className}` : responsiveClassName;
  const resolvedDate = parsePublishedAt(publishedAt);
  const resolvedTags = Array.isArray(tags) ? tags : [];

  return (
    <article className={containerClassName}>
      {leading ? <div className="mb-2 text-xs text-slate-400">{leading}</div> : null}
      <Link href={href} className="text-xl font-semibold text-slate-900 hover:underline">
        {title}
      </Link>
      <p className="mt-1 text-xs text-slate-500">{resolvedDate}</p>
      {summary ? (
        <div className="mt-3">
          <MarkdownViewer content={summary} className="prose prose-sm max-w-none text-slate-700" />
        </div>
      ) : summaryFallback ? (
        <p className="mt-3 text-sm text-slate-500">{summaryFallback}</p>
      ) : null}
      {resolvedTags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {resolvedTags.map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function parsePublishedAt(value: Date | string | null): string {
  if (!value) {
    return "发布时间待定";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "发布时间待定";
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}
