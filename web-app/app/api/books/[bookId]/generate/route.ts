export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { jobManager } from "@/lib/job-manager";
import { findProjectYaml, resolveBookDir } from "@/lib/load-knowledge";
import path from "path";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;
  const harnessRoot = path.resolve(process.cwd(), "..");

  const bookDir = resolveBookDir(bookId);
  if (!bookDir) {
    return NextResponse.json({ error: `Book "${bookId}" not found` }, { status: 404 });
  }

  const activeJobs = jobManager.listActive();
  for (const j of activeJobs) {
    if (j.logs.some((l) => l.msg?.includes(bookId))) {
      return NextResponse.json({ jobId: j.id }, { status: 200 });
    }
  }

  const yamlPath = findProjectYaml(bookId);
  if (!yamlPath) {
    return NextResponse.json({ error: `No project YAML found for "${bookId}"` }, { status: 404 });
  }

  const job = jobManager.spawn(
    "python3",
    ["-m", "pyharness", "run", "--project", yamlPath, "--log-sink", "$SINK_PATH", "--max-iterations", "3"],
    harnessRoot,
  );

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
