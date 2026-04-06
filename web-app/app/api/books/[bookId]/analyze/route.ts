export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { jobManager } from "@/lib/job-manager";
import { findProjectYaml } from "@/lib/load-knowledge";
import path from "path";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;
  const harnessRoot = path.resolve(process.cwd(), "..");

  const yamlPath = findProjectYaml(bookId);
  if (!yamlPath) {
    return NextResponse.json(
      { error: `No project YAML found for "${bookId}"` },
      { status: 404 },
    );
  }

  const existingForBook = jobManager.findActiveByBook(bookId);
  if (existingForBook) {
    return NextResponse.json({ jobId: existingForBook.id }, { status: 200 });
  }

  const job = jobManager.spawn(
    "bash",
    ["-c", [
      `cd "${harnessRoot}"`,
      `mkdir -p output/logs`,
      `python3 -m pyharness analyze --project "${yamlPath}" --force --log-sink "$SINK_PATH"`,
    ].join("\n")],
    harnessRoot,
    { bookId, jobType: "analyze" },
  );

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
