import { spawn, ChildProcess } from "child_process";
import {
  existsSync,
  unlinkSync,
  statSync,
  createReadStream,
  readFileSync,
  writeFileSync,
  renameSync,
} from "fs";
import { createInterface } from "readline";
import path from "path";
import crypto from "crypto";

export type JobState = "queued" | "running" | "done" | "failed";

export interface LogEntry {
  ts: string;
  level: string;
  msg: string;
  progress?: number;
  phase?: string;
}

export interface Job {
  id: string;
  state: JobState;
  startedAt: number;
  finishedAt?: number;
  logs: LogEntry[];
  progress: number;
  exitCode?: number;
  sinkPath: string;
  controlPath: string;
  process?: ChildProcess;
  subscribers: Set<(entry: LogEntry) => void>;
  evictionTimer?: ReturnType<typeof setTimeout>;
  onComplete?: () => Promise<void>;
}

const MAX_ACTIVE_JOBS = 10;
const EVICTION_MS = 30 * 60 * 1000;

class JobManagerSingleton {
  private jobs = new Map<string, Job>();
  private tailIntervals = new Map<string, ReturnType<typeof setInterval>>();

  spawn(
    command: string,
    args: string[],
    cwd: string,
    opts?: { onComplete?: () => Promise<void> },
  ): Job {
    const activeCount = [...this.jobs.values()].filter(
      (j) => j.state === "queued" || j.state === "running",
    ).length;
    if (activeCount >= MAX_ACTIVE_JOBS) {
      throw new Error(
        `Too many active jobs (${activeCount}/${MAX_ACTIVE_JOBS}). Try again later.`,
      );
    }

    const id = crypto.randomUUID();
    const sinkPath = path.join(cwd, `output/logs/job-${id}.jsonl`);
    const controlPath = path.join(cwd, `output/logs/job-${id}.cmd.json`);

    const job: Job = {
      id,
      state: "queued",
      startedAt: Date.now(),
      logs: [],
      progress: 0,
      sinkPath,
      controlPath,
      subscribers: new Set(),
      onComplete: opts?.onComplete,
    };

    this.jobs.set(id, job);
    this._startProcess(job, command, args, cwd);
    return job;
  }

  get(jobId: string): Job | null {
    return this.jobs.get(jobId) ?? null;
  }

  subscribe(jobId: string, callback: (entry: LogEntry) => void): () => void {
    const job = this.jobs.get(jobId);
    if (!job) return () => {};
    job.subscribers.add(callback);
    return () => {
      job.subscribers.delete(callback);
    };
  }


  sendCommand(jobId: string, command: object): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    if (job.state !== "running" && job.state !== "queued") return false;

    try {
      let existing: object[] = [];
      if (existsSync(job.controlPath)) {
        try {
          const raw = readFileSync(job.controlPath, "utf-8");
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) existing = parsed;
        } catch {
          existing = [];
        }
      }

      existing.push({ ...command, ts: new Date().toISOString() });

      const tmpPath = job.controlPath + ".tmp";
      writeFileSync(tmpPath, JSON.stringify(existing, null, 2), "utf-8");
      renameSync(tmpPath, job.controlPath);
      return true;
    } catch {
      return false;
    }
  }

  private _startProcess(
    job: Job,
    command: string,
    args: string[],
    cwd: string,
  ) {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        SINK_PATH: job.sinkPath,
        CONTROL_PATH: job.controlPath,
      },
    });
    job.process = child;
    job.state = "running";

    const pushEntry = (entry: LogEntry) => {
      job.logs.push(entry);
      if (entry.progress !== undefined) {
        job.progress = entry.progress;
      }
      for (const cb of job.subscribers) {
        try { cb(entry); } catch {}
      }
    };

    if (child.stdout) {
      const rl = createInterface({ input: child.stdout });
      rl.on("line", (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        pushEntry({
          ts: new Date().toTimeString().slice(0, 8),
          level: "INFO",
          msg: trimmed,
        });
      });
    }
    if (child.stderr) {
      const rl = createInterface({ input: child.stderr });
      rl.on("line", (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        pushEntry({
          ts: new Date().toTimeString().slice(0, 8),
          level: "ERROR",
          msg: trimmed,
        });
      });
    }

    this._tailSinkFile(job);

    child.on("close", async (code) => {
      job.exitCode = code ?? 1;
      job.state = code === 0 ? "done" : "failed";
      job.finishedAt = Date.now();
      job.progress = code === 0 ? 100 : job.progress;

      const terminalEntry: LogEntry = {
        ts: new Date().toTimeString().slice(0, 8),
        level: code === 0 ? "OK" : "ERROR",
        msg: code === 0 ? "Job completed successfully" : `Job failed with exit code ${code}`,
        progress: code === 0 ? 100 : job.progress,
      };
      pushEntry(terminalEntry);

      this._stopTail(job.id);

      if (job.onComplete && code === 0) {
        try {
          await job.onComplete();
        } catch (e) {
          console.error(`[JobManager] onComplete failed for ${job.id}:`, e);
        }
      }

      job.evictionTimer = setTimeout(() => {
        this._evict(job.id);
      }, EVICTION_MS);
    });

    child.on("error", (err) => {
      job.state = "failed";
      job.finishedAt = Date.now();
      pushEntry({
        ts: new Date().toTimeString().slice(0, 8),
        level: "ERROR",
        msg: `Process error: ${err.message}`,
      });
      this._stopTail(job.id);
      job.evictionTimer = setTimeout(() => {
        this._evict(job.id);
      }, EVICTION_MS);
    });
  }

  private _tailSinkFile(job: Job) {
    let bytesRead = 0;

    const interval = setInterval(() => {
      if (!existsSync(job.sinkPath)) return;
      try {
        const { size } = statSync(job.sinkPath);
        if (size <= bytesRead) return;

        const stream = createReadStream(job.sinkPath, {
          start: bytesRead,
          encoding: "utf-8",
        });
        const rl = createInterface({ input: stream });
        rl.on("line", (line) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          try {
            const parsed = JSON.parse(trimmed) as LogEntry;
            if (parsed.ts && parsed.level && parsed.msg) {
              const isDuplicate = job.logs.some(
                (e) => e.ts === parsed.ts && e.msg === parsed.msg && e.level === parsed.level,
              );
              if (!isDuplicate) {
                job.logs.push(parsed);
                if (parsed.progress !== undefined) {
                  job.progress = parsed.progress;
                }
                for (const cb of job.subscribers) {
                  try { cb(parsed); } catch {}
                }
              }
            }
          } catch {}
        });
        rl.on("close", () => {
          bytesRead = size;
        });
      } catch {}
    }, 500);

    this.tailIntervals.set(job.id, interval);
  }

  private _stopTail(jobId: string) {
    const interval = this.tailIntervals.get(jobId);
    if (interval) {
      clearInterval(interval);
      this.tailIntervals.delete(jobId);
    }
  }

  private _evict(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    this._stopTail(jobId);

    try {
      if (existsSync(job.sinkPath)) {
        unlinkSync(job.sinkPath);
      }
    } catch {}

    try {
      if (existsSync(job.controlPath)) {
        unlinkSync(job.controlPath);
      }
    } catch {}

    if (job.evictionTimer) clearTimeout(job.evictionTimer);
    job.subscribers.clear();
    this.jobs.delete(jobId);
  }

  shutdown() {
    for (const [, job] of this.jobs) {
      if (job.process && !job.process.killed) {
        job.process.kill("SIGTERM");
      }
      if (job.evictionTimer) clearTimeout(job.evictionTimer);
      this._stopTail(job.id);
    }
  }
}

export const jobManager = new JobManagerSingleton();

if (typeof process !== "undefined") {
  const cleanup = () => jobManager.shutdown();
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
}
