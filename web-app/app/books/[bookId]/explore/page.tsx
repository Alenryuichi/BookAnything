import { KnowledgeGraphPage } from "@/components/KnowledgeGraph/KnowledgeGraphPage";

export default async function ExplorePage({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ highlight?: string; view?: string; tour?: string }>;
}) {
  const { bookId } = await params;
  const { highlight } = await searchParams;

  return <KnowledgeGraphPage bookId={bookId} initialHighlight={highlight} />;
}
