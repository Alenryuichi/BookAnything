"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Trash2, AlertTriangle } from "lucide-react";

export function DeleteBookButton({ bookId, bookTitle }: { bookId: string; bookTitle?: string }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const title = bookTitle || bookId;

  const handleDelete = async () => {
    setIsDeleting(true);
    setProgressStep(1); // Start illusion animation
    
    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        // Finish animation successfully
        setProgressStep(5);
        setIsFinished(true);
        setTimeout(() => {
          router.push("/books");
          router.refresh();
        }, 1000); // Wait for user to read success message
      } else {
        const data = await res.json();
        alert(`删除失败: ${data.error || "未知错误"}`);
        setIsDeleting(false);
        setIsOpen(false);
        setProgressStep(0);
      }
    } catch (err) {
      console.error("Failed to delete book:", err);
      alert("删除失败，请查看控制台日志。");
      setIsDeleting(false);
      setIsOpen(false);
      setProgressStep(0);
    }
  };

  // Run the illusion animation
  useEffect(() => {
    if (!isDeleting || isFinished) return;
    
    // Auto advance progress steps if API takes a while
    const timer = setTimeout(() => {
      setProgressStep(prev => (prev < 4 ? prev + 1 : prev));
    }, 400); // 400ms per step
    
    return () => clearTimeout(timer);
  }, [isDeleting, progressStep, isFinished]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        disabled={isDeleting}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="删除书籍"
      >
        <Trash2 className="w-4 h-4" />
        {isDeleting ? "删除中..." : "删除书籍"}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-xl overflow-hidden shadow-2xl border border-[#3e3e42] animate-in zoom-in-95 duration-200 bg-[#1c1c1e] text-[#a9a9b3] font-mono">
            {/* Terminal Header */}
            <div className="flex items-center px-4 py-3 bg-[#2d2d30] border-b border-[#3e3e42]">
              <div className="flex gap-2 mr-4">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
              <div className="text-xs font-semibold tracking-wide text-[#d4d4d8] flex-1 text-center truncate pr-12">
                harness-cli — delete
              </div>
            </div>
            
            {/* Terminal Body */}
            <div className="p-5 text-sm space-y-4">
              <div className="flex items-start gap-2">
                <span className="text-green-400 shrink-0">❯</span>
                <span className="text-[#d4d4d8]">harness rm --force "{title}"</span>
              </div>
              
              <div className="space-y-2 mt-4 text-[#d4d4d8]">
                <p className="font-bold text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> 
                  DANGER: IRREVERSIBLE OPERATION
                </p>
                <p className="text-xs mt-1">This will permanently destroy:</p>
                <ul className="list-none space-y-1 mt-2 text-xs opacity-90 pl-1 border-l-2 border-[#3e3e42] ml-1">
                  <li className="flex gap-2"><span className="text-red-400">✗</span> projects/{bookId}.yaml</li>
                  <li className="flex gap-2"><span className="text-red-400">✗</span> knowledge/{bookId}/*</li>
                  <li className="flex gap-2"><span className="text-red-400">✗</span> workspaces/{bookId}/*</li>
                </ul>
              </div>
              
              <div className="pt-4 border-t border-[#3e3e42] flex items-center gap-2 text-xs">
                <span className="text-[#d4d4d8]">Are you sure you want to proceed? [y/N]</span>
                {isDeleting && <span className="text-green-400 font-bold">y</span>}
              </div>
              
              {/* Progress Illusion */}
              {isDeleting && (
                <div className="space-y-1.5 pt-2 pb-1 text-xs font-mono">
                  {progressStep >= 1 && (
                    <div className="flex gap-2">
                      <span className="text-blue-400">[1/4]</span>
                      <span className="text-[#d4d4d8]">Stopping background jobs...</span>
                      {progressStep > 1 && <span className="text-green-400 ml-auto">done</span>}
                    </div>
                  )}
                  {progressStep >= 2 && (
                    <div className="flex gap-2">
                      <span className="text-blue-400">[2/4]</span>
                      <span className="text-[#d4d4d8]">Removing projects/{bookId}.yaml...</span>
                      {progressStep > 2 && <span className="text-green-400 ml-auto">done</span>}
                    </div>
                  )}
                  {progressStep >= 3 && (
                    <div className="flex gap-2">
                      <span className="text-blue-400">[3/4]</span>
                      <span className="text-[#d4d4d8]">Erasing knowledge/{bookId}...</span>
                      {progressStep > 3 && <span className="text-green-400 ml-auto">done</span>}
                    </div>
                  )}
                  {progressStep >= 4 && (
                    <div className="flex gap-2">
                      <span className="text-blue-400">[4/4]</span>
                      <span className="text-[#d4d4d8]">Wiping workspaces/{bookId}...</span>
                      {isFinished && <span className="text-green-400 ml-auto">done</span>}
                    </div>
                  )}
                  {isFinished && (
                    <div className="mt-3 pt-2 border-t border-[#3e3e42]/50 animate-in fade-in">
                      <div className="flex items-center gap-2 text-green-400 font-bold">
                        <span>✔</span> SUCCESS: Book permanently deleted.
                      </div>
                      <div className="text-[#a9a9b3] mt-1 italic animate-pulse">
                        Redirecting...
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Terminal Footer / Controls */}
            {!isDeleting && (
              <div className="flex items-center gap-3 p-4 bg-[#1c1c1e] border-t border-[#3e3e42]">
                <div className="flex-1"></div>
                <button
                  onClick={() => setIsOpen(false)}
                  disabled={isDeleting}
                  className="px-4 py-1.5 text-xs font-medium text-[#d4d4d8] bg-[#2d2d30] border border-[#3e3e42] rounded hover:bg-[#3e3e42] hover:text-white transition-colors disabled:opacity-50 font-sans tracking-wide"
                >
                  N (Cancel)
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium text-white bg-red-500/20 border border-red-500/50 rounded hover:bg-red-500/40 transition-colors disabled:opacity-50 min-w-[80px] font-sans tracking-wide"
                >
                  y (Confirm)
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
