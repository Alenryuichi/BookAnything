export const dynamic = "force-dynamic";

import { readFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;
  const kgPath = join(process.cwd(), "..", "knowledge", bookId, "knowledge-graph.json");

  try {
    const raw = await readFile(kgPath, "utf-8");
    const data = JSON.parse(raw);
    
    try {
      const outlinePath = join(process.cwd(), "..", "knowledge", bookId, "chapter-outline.json");
      const outlineRaw = await readFile(outlinePath, "utf-8");
      const outline = JSON.parse(outlineRaw);
      const uncoveredNodes = new Set(outline.uncovered_nodes || []);
      
      data.nodes = data.nodes.map((n: any) => ({
        ...n,
        isCovered: !uncoveredNodes.has(n.id)
      }));
    } catch {
      // no outline, all covered
      data.nodes = data.nodes.map((n: any) => ({ ...n, isCovered: true }));
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Knowledge graph not yet generated" },
      { status: 404 },
    );
  }
}
