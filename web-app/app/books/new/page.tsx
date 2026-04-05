"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DynamicTextLoader } from "@/components/DynamicTextLoader";

export default function NewBookPage() {
  const [repoPath, setRepoPath] = useState("");
  const [loading, setLoading] = useState(false);
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

    try {
      const res = await fetch("/api/books", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ repo_path: repoPath.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.details || data.error || "Failed to create book");
      }

      // Success, refresh the book list to get the new book and redirect to the bookshelf
      await fetch("/api/books?refresh=true");
      router.refresh();
      router.push("/books");
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
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

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md text-sm whitespace-pre-wrap font-mono">
              {error}
            </div>
          )}

          {loading ? (
            <div className="mt-4">
              <DynamicTextLoader text="Scanning Repository..." />
            </div>
          ) : (
            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
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
