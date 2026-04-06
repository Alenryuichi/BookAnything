export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { jobManager } from "@/lib/job-manager";
import { findProjectYaml } from "@/lib/load-knowledge";
import { existsSync, readFileSync, unlinkSync } from "fs";
import path from "path";

function cleanStaleLock(harnessRoot: string): void {
  const lockPath = path.join(harnessRoot, ".harness.lock");
  if (!existsSync(lockPath)) return;
  try {
    const pid = parseInt(readFileSync(lockPath, "utf-8").trim(), 10);
    if (isNaN(pid)) {
      unlinkSync(lockPath);
      return;
    }
    try {
      process.kill(pid, 0);
    } catch {
      unlinkSync(lockPath);
    }
  } catch {
    // ignore read/unlink errors
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;
  const harnessRoot = path.resolve(process.cwd(), "..");

  const yamlPath = findProjectYaml(bookId);
  if (!yamlPath) {
    return NextResponse.json({ error: `No project YAML found for "${bookId}"` }, { status: 404 });
  }

  const existingForBook = jobManager.findActiveByBook(bookId);
  if (existingForBook) {
    return NextResponse.json({ jobId: existingForBook.id }, { status: 200 });
  }

  const allActive = jobManager.listActive();
  const otherGenJob = allActive.find((j) => j.bookId && j.bookId !== bookId);
  if (otherGenJob) {
    return NextResponse.json(
      { error: `Another generation is already running for "${otherGenJob.bookId}". Only one generation can run at a time.` },
      { status: 409 },
    );
  }

  cleanStaleLock(harnessRoot);

  const job = jobManager.spawn(
    "bash",
    ["-c", [
      `cd "${harnessRoot}"`,
      `mkdir -p output/logs`,
      `python3 -m pyharness run --project "${yamlPath}" --log-sink "$SINK_PATH" --control-file "$CONTROL_PATH" --max-iterations 3`,
    ].join("\n")],
    harnessRoot,
    { bookId },
  );

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
