import { NextResponse } from "next/server";
import { jobManager } from "@/lib/job-manager";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const job = jobManager.get(jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    state: job.state,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    progress: job.progress,
    exitCode: job.exitCode,
    logs: job.logs,
  });
}
