"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ChapterActions({ bookId, chapterId }: { bookId: string; chapterId: string }) {
  const [isRewriting, setIsRewriting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleRewrite = async () => {
    if (!confirm("Are you sure you want to rewrite this chapter? This will overwrite the existing content.")) return;
    
    setIsRewriting(true);
    try {
      const res = await fetch(`/api/books/${bookId}/chapters/${chapterId}`, {
        method: "PUT",
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.details || error.error || "Failed to rewrite chapter");
      }
      
      router.refresh();
    } catch (err: any) {
      alert(`Error rewriting chapter: ${err.message}`);
    } finally {
      setIsRewriting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this chapter? This action cannot be undone.")) return;
    
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/books/${bookId}/chapters/${chapterId}`, {
        method: "DELETE",
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.details || error.error || "Failed to delete chapter");
      }
      
      router.push(`/books/${bookId}`);
    } catch (err: any) {
      alert(`Error deleting chapter: ${err.message}`);
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex gap-3 mb-8">
      <button
        onClick={handleRewrite}
        disabled={isRewriting || isDeleting}
        className="px-3 py-1.5 text-sm font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        {isRewriting ? (
          <>
            <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Rewriting...
          </>
        ) : (
          "↻ Rewrite"
        )}
      </button>
      <button
        onClick={handleDelete}
        disabled={isRewriting || isDeleting}
        className="px-3 py-1.5 text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        {isDeleting ? "Deleting..." : "🗑 Delete"}
      </button>
    </div>
  );
}
