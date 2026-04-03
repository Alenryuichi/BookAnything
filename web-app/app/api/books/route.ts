import { NextResponse } from "next/server";
import { loadBookIndex, invalidateIndexCache } from "@/lib/load-knowledge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("refresh") === "true") {
    invalidateIndexCache();
  }
  try {
    const index = loadBookIndex();
    return NextResponse.json(index);
  } catch {
    return NextResponse.json({ error: "Failed to load book index" }, { status: 500 });
  }
}
