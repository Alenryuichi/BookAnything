"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TerminalLoader } from "@/components/TerminalLoader";

export default function NewBookPage() {
  const [repoPath, setRepoPath] = useState("");
  const [quickMode, setQuickMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoPath.trim()) {
      setError("Please enter a repository path or URL");
      return;
    }

    setLoading(true);
    setError("");
    setJobId(null);

    try {
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_path: repoPath.trim(), quick: quickMode }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.details || data.error || "Failed to create book");
      }

      if (data.jobId) {
        setJobId(data.jobId);
      } else {
        await fetch("/api/books?refresh=true");
        router.refresh();
        router.push("/books");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      setLoading(false);
    }
  };

  const handleJobDone = useCallback(async () => {
    await fetch("/api/books?refresh=true");
    router.refresh();
    router.push("/books");
  }, [router]);

  const handleJobError = useCallback((msg: string) => {
    setError(msg);
    setLoading(false);
    setJobId(null);
  }, []);

  const handleRetry = () => {
    setError("");
    setLoading(false);
    setJobId(null);
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-8 dark:text-white">Create a New Book</h1>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border dark:border-slate-700 p-6">
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="repoPath" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Repository URL or Local Path
            </label>
            <input
              type="text"
              id="repoPath"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="e.g., https://github.com/facebook/react or /Users/me/projects/react"
              className="w-full px-4 py-2 border rounded-md dark:bg-slate-900 dark:border-slate-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              The AI harness will scan this repository and automatically generate a chapter plan.
              This process usually takes 30-60 seconds.
            </p>
          </div>

          <div className="flex items-center justify-between py-3 px-1 mb-4">
            <div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Quick Mode</span>
              <p className="text-xs text-slate-500 dark:text-slate-400">Skip review &amp; visual testing for faster results (~5 min)</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={quickMode}
              onClick={() => setQuickMode(!quickMode)}
              disabled={loading}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${quickMode ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-600"}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${quickMode ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md text-sm whitespace-pre-wrap font-mono">
              {error}
              {!loading && (
                <button
                  type="button"
                  onClick={handleRetry}
                  className="mt-3 block text-blue-500 hover:text-blue-400 underline text-xs"
                >
                  Try again
                </button>
              )}
            </div>
          )}

          {loading || jobId ? (
            <div className="mt-4">
              {quickMode && (
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <span>⚡</span> Quick Mode
                </div>
              )}
              <TerminalLoader
                jobId={jobId ?? undefined}
                onDone={handleJobDone}
                onError={handleJobError}
              />
            </div>
          ) : (
            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Book
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
