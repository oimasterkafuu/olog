import { prisma } from "@/lib/db";
import { ResponsiveTable } from "@/components/responsive-table";

export const metadata = {
  title: "AI 调用记录",
};

const formatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function translateKind(kind: "PUBLISH_METADATA" | "SUMMARY") {
  return kind === "PUBLISH_METADATA" ? "发布元数据" : "摘要生成";
}

async function getRecentReviews() {
  return prisma.aIReview.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      post: {
        select: {
          id: true,
          title: true,
          slug: true,
        },
      },
    },
  });
}

export default async function AdminAIReviewPage() {
  const reviews = await getRecentReviews();
  const rows = reviews.map((review) => ({
    ...review,
    createdLabel: formatter.format(review.createdAt),
    costLabel: review.cost == null ? "-" : review.cost.toFixed(6),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">AI 调用记录</h1>
        <p className="mt-1 text-sm text-slate-500">展示最近 100 条 AI 服务调用的返回原文、解析结果与费用。</p>
      </div>
      <ResponsiveTable
        className="md:rounded-lg md:border md:border-slate-200 md:bg-white md:shadow-sm"
        rows={rows}
        getRowKey={(row) => row.id}
        emptyState="暂无 AI 调用记录。"
        columns={[
          {
            id: "post",
            header: "文章",
            accessor: (review) => (
              <div className="space-y-1">
                <div className="font-medium text-slate-900">{review.post?.title ?? "-"}</div>
                <div className="text-xs text-slate-400">{review.post?.slug ?? review.postId}</div>
              </div>
            ),
            mobile: "primary",
            mobileAccessor: (review) => (
              <div className="space-y-2">
                <div className="text-base font-medium text-slate-900">{review.post?.title ?? "-"}</div>
                <div className="text-xs text-slate-500">{review.post?.slug ?? review.postId}</div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <span>{translateKind(review.kind)}</span>
                  <StatusPill ok={review.ok} />
                  <span>{review.createdLabel}</span>
                </div>
                {review.errorMessage ? (
                  <p className="text-xs text-rose-500">{review.errorMessage}</p>
                ) : null}
              </div>
            ),
          },
          {
            id: "kind",
            header: "类型",
            accessor: (review) => <span className="text-slate-600">{translateKind(review.kind)}</span>,
            mobile: "hidden",
          },
          {
            id: "status",
            header: "状态",
            accessor: (review) => (
              <div className="space-y-1">
                <StatusPill ok={review.ok} />
                {review.errorMessage ? <div className="text-xs text-rose-500">{review.errorMessage}</div> : null}
              </div>
            ),
            mobile: "hidden",
          },
          {
            id: "model",
            header: "模型",
            accessor: (review) => <span className="text-slate-600">{review.model}</span>,
            mobile: "meta",
            mobileLabel: "模型",
          },
          {
            id: "token",
            header: "Token",
            accessor: (review) => <span className="text-slate-600">{review.tokenUsage}</span>,
            mobile: "meta",
            mobileLabel: "Token 用量",
          },
          {
            id: "cost",
            header: "费用",
            accessor: (review) => <span className="text-slate-600">{review.costLabel}</span>,
            mobile: "meta",
            mobileLabel: "费用",
          },
          {
            id: "prompt",
            header: "Prompt",
            accessor: (review) => <CodePreview content={review.prompt} emptyPlaceholder="(空)" />, 
            mobile: "hidden",
            mobileLabel: "Prompt",
          },
          {
            id: "output",
            header: "返回解析",
            accessor: (review) => (
              <CodePreview
                content={review.outputJson ? JSON.stringify(review.outputJson, null, 2) : null}
                emptyPlaceholder="(无)"
              />
            ),
            mobile: "hidden",
            mobileLabel: "返回解析",
          },
          {
            id: "raw",
            header: "原始响应",
            accessor: (review) => <CodePreview content={review.rawText} emptyPlaceholder="(无)" />, 
            mobile: "hidden",
            mobileLabel: "原始响应",
          },
          {
            id: "time",
            header: "时间",
            accessor: (review) => <span className="text-slate-500">{review.createdLabel}</span>,
            mobile: "hidden",
          },
        ]}
      />
    </div>
  );
}

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span className={`text-xs font-medium ${ok ? "text-emerald-600" : "text-rose-600"}`}>
      {ok ? "成功" : "失败"}
    </span>
  );
}

function CodePreview({ content, emptyPlaceholder }: { content: string | null | undefined; emptyPlaceholder: string }) {
  if (!content) {
    return <span className="text-slate-400">{emptyPlaceholder}</span>;
  }
  return (
    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-xs text-slate-700">
      {content}
    </pre>
  );
}
