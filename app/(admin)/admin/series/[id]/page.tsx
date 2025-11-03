import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SeriesForm } from "@/components/series-form";

export const metadata = {
  title: "编辑系列",
};

async function getSeries(id: string) {
  return prisma.series.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      hidden: true,
      orderJson: true,
    },
  });
}

async function getSeriesPosts(id: string) {
  return prisma.post.findMany({
    where: { seriesId: id },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      publishedAt: true,
    },
  });
}

export default async function EditSeriesPage({ params }: { params: { id: string } }) {
  const series = await getSeries(params.id);
  if (!series) {
    notFound();
  }

  const posts = await getSeriesPosts(series.id);
  const orderArray = Array.isArray(series.orderJson)
    ? (series.orderJson as unknown[]).filter((id): id is string => typeof id === "string")
    : [];

  const postMap = new Map(posts.map((post) => [post.id, post]));
  const orderedPosts = [...orderArray, ...posts.filter((post) => !orderArray.includes(post.id)).map((post) => post.id)]
    .map((id) => postMap.get(id))
    .filter((item): item is (typeof posts)[number] => Boolean(item))
    .map((item) => ({
      id: item.id,
      title: item.title,
      slug: item.slug,
      status: item.status,
      publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">编辑系列</h1>
        <p className="mt-1 text-sm text-slate-500">Slug：{series.slug}</p>
      </div>
      <SeriesForm
        mode="edit"
        series={{
          id: series.id,
          title: series.title,
          slug: series.slug,
          description: series.description,
          hidden: series.hidden,
        }}
        posts={orderedPosts}
      />
    </div>
  );
}
