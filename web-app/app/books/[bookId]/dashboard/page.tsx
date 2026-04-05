export const dynamic = "force-dynamic";

import Link from "next/link";
import { loadBookTitle, loadChapterIds, loadParts } from "@/lib/load-knowledge";
import { GenerationDashboard } from "@/components/GenerationDashboard";
import { StartGenerationButton } from "@/components/StartGenerationButton";

export default async function DashboardPage({ params, searchParams }: { params: Promise<{ bookId: string }>; searchParams: Promise<{ jobId?: string }> }) {
  const { bookId } = await params;
  const { jobId } = await searchParams;
  const bookTitle = loadBookTitle(bookId);
  const parts = loadParts(bookId);
  const chapters: { id: string; title: string }[] = [];
  for (const part of parts) for (const id of part.ids) chapters.push({ id, title: id });
  if (!chapters.length) for (const id of loadChapterIds(bookId)) chapters.push({ id, title: id });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Link href={`/books/${bookId}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">← {bookTitle}</Link>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium">Generation Dashboard</span>
      </div>
      {jobId ? (
        <GenerationDashboard jobId={jobId} bookId={bookId} chapters={chapters} />
      ) : (
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold mb-3">No Active Generation</h2>
          <p className="text-muted-foreground mb-8">Start a generation run to see real-time progress here.</p>
          <StartGenerationButton bookId={bookId} />
        </div>
      )}
    </div>
  );
}
