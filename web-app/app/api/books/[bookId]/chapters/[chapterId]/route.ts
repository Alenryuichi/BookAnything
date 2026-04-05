import { NextResponse } from "next/server";
import { loadChapters } from "@/lib/load-knowledge";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string; chapterId: string }> }
) {
  const { bookId, chapterId } = await params;
  try {
    const chapters = loadChapters(bookId);
    const chapter = chapters[chapterId];
    if (!chapter) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }
    return NextResponse.json(chapter);
  } catch {
    return NextResponse.json({ error: "Failed to load chapter" }, { status: 500 });
  }
}
