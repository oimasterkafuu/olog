'use client';

import { useState } from "react";
import { PostPublishPanel } from "@/components/post-publish-panel";
import { PostEditorForm } from "@/components/post-editor-form";

type EditableStatus = "DRAFT" | "PUBLISHED";

interface PostEditWorkspaceProps {
  post: {
    id: string;
    title: string;
    slug: string;
    contentMd: string;
    autoSummary: boolean;
    hidden?: boolean;
    status: EditableStatus;
    seriesId?: string | null;
    publishedAt?: string | null;
  };
  seriesOptions: { id: string; title: string }[];
}

export function PostEditWorkspace({ post, seriesOptions }: PostEditWorkspaceProps) {
  const [publishing, setPublishing] = useState(false);

  return (
    <>
      <PostPublishPanel
        postId={post.id}
        status={post.status}
        autoSummary={post.autoSummary}
        slug={post.slug}
        publishedAt={post.publishedAt ?? null}
        onPublishingChange={setPublishing}
      />
      <PostEditorForm
        mode="edit"
        seriesOptions={seriesOptions}
        post={{
          id: post.id,
          title: post.title,
          slug: post.slug,
          contentMd: post.contentMd,
          autoSummary: post.autoSummary,
          hidden: post.hidden,
          seriesId: post.seriesId,
        }}
        disabled={publishing}
      />
    </>
  );
}
