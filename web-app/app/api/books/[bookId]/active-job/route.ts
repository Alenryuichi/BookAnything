export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { jobManager } from "@/lib/job-manager";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;
  const job = jobManager.findActiveByBook(bookId);

  if (!job) {
    return NextResponse.json({ error: "No active job" }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.id,
    state: job.state,
    progress: job.progress,
  });
}
