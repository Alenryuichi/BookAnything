export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { jobManager } from "@/lib/job-manager";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;

  const analyzeJob = jobManager.findActiveByBook(bookId, "analyze");
  if (analyzeJob) {
    return NextResponse.json({
      jobId: analyzeJob.id,
      state: analyzeJob.state,
      progress: analyzeJob.progress,
      jobType: "analyze",
    });
  }

  const generateJob = jobManager.findActiveByBook(bookId, "generate");
  if (generateJob) {
    return NextResponse.json({
      jobId: generateJob.id,
      state: generateJob.state,
      progress: generateJob.progress,
      jobType: "generate",
    });
  }

  return NextResponse.json({ error: "No active job" }, { status: 404 });
}
