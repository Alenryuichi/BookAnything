"use client";

import { useState } from "react";
import { GitBranch, RefreshCw, ArrowLeft, Link2, FolderOpen } from "lucide-react";

interface RepoStatus {
  exists: boolean;
  repoPath: string;
  remoteUrl: string | null;
  canReclone: boolean;
}

interface Props {
  bookId: string;
  status: RepoStatus;
  onCloneComplete: () => void;
}

export function RepoMissing({ bookId, status, onCloneComplete }: Props) {
  const [input, setInput] = useState(status.remoteUrl || "");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const isUrl = /^https?:\/\/.+/.test(input.trim());

  const handleSubmit = async () => {
    const value = input.trim();
    if (!value) return;

    setBusy(true);
    setError("");

    try {
      if (isUrl) {
        setProgress("Saving remote URL...");
        const patchRes = await fetch(`/api/books/${bookId}/repo-status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remoteUrl: value }),
        });
        if (!patchRes.ok) {
          const d = await patchRes.json();
          throw new Error(d.error || "Failed to save remote URL");
        }

        setProgress("Cloning repository...");
        const cloneRes = await fetch(`/api/books/${bookId}/reclone`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remoteUrl: value }),
        });
        const cloneData = await cloneRes.json();
        if (!cloneRes.ok) {
          throw new Error(cloneData.error || "Clone failed");
        }

        setProgress("Waiting for clone to finish...");
        await pollUntilReady();
      } else {
        setProgress("Updating repository path...");
        const patchRes = await fetch(`/api/books/${bookId}/repo-status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoPath: value }),
        });
        const patchData = await patchRes.json();
        if (!patchRes.ok) {
          throw new Error(patchData.error || "Failed to update path");
        }

        if (patchData.exists) {
          onCloneComplete();
          return;
        } else {
          throw new Error(
            `Path "${value}" does not exist on disk. Use a git URL to clone.`,
          );
        }
      }
    } catch (e: any) {
      setError(e.message || String(e));
      setBusy(false);
    }
  };

  const pollUntilReady = () =>
    new Promise<void>((resolve, reject) => {
      let attempts = 0;
      const check = async () => {
        attempts++;
        if (attempts > 120) {
          reject(new Error("Clone timed out (>2 minutes)"));
          return;
        }
        try {
          const res = await fetch(`/api/books/${bookId}/repo-status`);
          const data = await res.json();
          if (data.exists) {
            setBusy(false);
            setProgress("");
            onCloneComplete();
            resolve();
            return;
          }
        } catch {}
        setTimeout(check, 1000);
      };
      setTimeout(check, 2000);
    });

  const handleReclone = async () => {
    setBusy(true);
    setError("");
    setProgress("Cloning repository...");
    try {
      const res = await fetch(`/api/books/${bookId}/reclone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Clone failed");
      setProgress("Waiting for clone to finish...");
      await pollUntilReady();
    } catch (e: any) {
      setError(e.message || String(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-56px)] gap-5 px-4">
      <GitBranch className="w-14 h-14 text-blue-400/40" />

      <div className="text-center">
        <h2 className="text-lg font-bold">Connect Repository</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          The source repository for this book is not available locally.
          {status.remoteUrl
            ? " Click Re-clone or provide a new address below."
            : " Provide a Git URL or local path to continue."}
        </p>
      </div>

      {status.canReclone && (
        <button
          onClick={handleReclone}
          disabled={busy}
          className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Cloning..." : `Re-clone from ${status.remoteUrl}`}
        </button>
      )}

      <div className="w-full max-w-md space-y-3">
        {status.canReclone && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex-1 h-px bg-border" />
            <span>or enter a different address</span>
            <div className="flex-1 h-px bg-border" />
          </div>
        )}

        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {isUrl ? (
              <Link2 className="w-4 h-4" />
            ) : (
              <FolderOpen className="w-4 h-4" />
            )}
          </div>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && handleSubmit()}
            placeholder="https://github.com/org/repo  or  /path/to/local/repo"
            disabled={busy}
            className="w-full pl-10 pr-4 py-3 text-sm bg-muted/50 border border-border rounded-lg placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 disabled:opacity-50"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={busy || !input.trim()}
          className="w-full py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              {progress}
            </>
          ) : isUrl ? (
            <>
              <GitBranch className="w-4 h-4" />
              Clone & Connect
            </>
          ) : (
            <>
              <FolderOpen className="w-4 h-4" />
              Set Local Path
            </>
          )}
        </button>

        <p className="text-xs text-muted-foreground text-center">
          {isUrl
            ? "The repository will be cloned to the local workspace."
            : input.trim()
              ? "Point to an existing local directory."
              : "Enter a Git URL to clone, or a local directory path."}
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-400 max-w-md text-center">{error}</p>
      )}

      <a
        href={`/books/${bookId}`}
        className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Book
      </a>
    </div>
  );
}
