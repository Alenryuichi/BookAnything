import { loadKnowledge } from "@/lib/load-knowledge";
import { buildSearchEntries } from "@/lib/search-index";
import { SearchClient } from "@/components/SearchClient";

export default async function SearchPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const knowledge = loadKnowledge(bookId);
  const entries = buildSearchEntries(knowledge.modules, knowledge.chapters, bookId);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>搜索</h1>
      <SearchClient entries={entries} />
    </div>
  );
}
