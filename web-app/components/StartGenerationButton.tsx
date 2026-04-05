"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartGenerationButton({
  bookId,
  className,
}: {
  bookId: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

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
