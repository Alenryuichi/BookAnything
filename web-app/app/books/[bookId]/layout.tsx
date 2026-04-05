import { Sidebar } from "@/components/Sidebar";
import { loadKnowledge, loadParts, loadBookTitle } from "@/lib/load-knowledge";
import { buildSearchEntries } from "@/lib/search-index";
import { CommandPalette } from "@/components/CommandPalette";
import { GraphModal } from "@/components/GraphModal";

export default async function BookLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const knowledge = loadKnowledge(bookId);
  const parts = loadParts(bookId);
  const bookTitle = loadBookTitle(bookId);
  const searchEntries = buildSearchEntries(knowledge.modules, knowledge.chapters, bookId);

  return (
    <>
      <Sidebar chapters={knowledge.chapters} parts={parts} bookTitle={bookTitle} bookId={bookId} />
      <CommandPalette entries={searchEntries} />
      <GraphModal bookId={bookId} />
      <div className="main-content">
        <main className="px-6 pt-6 pb-20">
          {children}
        </main>
      </div>
    </>
  );
}
