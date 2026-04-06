"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface ActiveJob {
  jobId: string;
  state: string;
  progress: number;
}

export function StartGenerationButton({
  bookId,
  className,
}: {
  bookId: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/books/${bookId}/active-job`);
        if (res.ok && !cancelled) {
          const data: ActiveJob = await res.json();
          setActiveJob(data);
        } else if (res.status === 404 && !cancelled) {
          setActiveJob(null);
        }
      } catch {
        // network error — keep previous state
      }
    }

    poll();
    intervalRef.current = setInterval(poll, 3000);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [bookId]);

  async function handleStart() {
    setLoading(true);
    try {
      const res = await fetch(`/api/books/${bookId}/generate`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.jobId) {
        router.push(`/books/${bookId}/dashboard?jobId=${data.jobId}`);
      }
    } catch (err) {
      console.error("Failed to start generation:", err);
    } finally {
      setLoading(false);
    }
  }

  if (activeJob) {
    return (
      <Link
        href={`/books/${bookId}/dashboard?jobId=${activeJob.jobId}`}
        className="group flex items-center gap-3 px-4 h-10 rounded-lg border border-border bg-card hover:border-foreground transition-colors min-w-[260px]"
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <div className="flex-1 flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">Generation running...</span>
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-500 ease-out"
              style={{ width: `${activeJob.progress}%` }}
            />
          </div>
          <span className="text-xs font-mono text-muted-foreground w-8 text-right">
            {activeJob.progress}%
          </span>
        </div>
      </Link>
    );
  }

  return (
    <button
      onClick={handleStart}
      disabled={loading}
      className={
        className ??
        "px-6 py-3 rounded-lg bg-foreground text-background font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
      }
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Starting…
        </span>
      ) : (
        "▶ Start Generation"
      )}
    </button>
  );
}
