"use client";

import { useState, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useKnowledgeGraph } from "./hooks/useKnowledgeGraph";
import { GraphCanvas } from "./GraphCanvas";
import { GraphToolbar } from "./GraphToolbar";
import { NodeDetailPanel } from "./NodeDetailPanel";
import { TourOverlay } from "./TourOverlay";
import { AnalyzeProgress } from "./AnalyzeProgress";
import { RepoMissing } from "./RepoMissing";
import { Network } from "lucide-react";

interface RepoStatus {
  exists: boolean;
  repoPath: string;
  remoteUrl: string | null;
  canReclone: boolean;
}

interface Props {
  bookId: string;
  initialHighlight?: string;
}

function EmptyState({
  bookId,
  onJobStarted,
}: {
  bookId: string;
  onJobStarted: (jobId: string) => void;
}) {
  const [starting, setStarting] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const startAnalyze = async () => {
    setStarting(true);
    setErrMsg("");
    try {
      const res = await fetch(`/api/books/${bookId}/analyze`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setErrMsg(data.error || "Failed to start analysis");
        setStarting(false);
        return;
      }
      onJobStarted(data.jobId);
    } catch (e) {
      setErrMsg(String(e));
      setStarting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-56px)] gap-4 px-4">
      <Network className="w-16 h-16 text-muted-foreground/30" />
      <h2 className="text-lg font-bold">Knowledge Graph</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        No knowledge graph has been generated for this book yet. Click below to
        analyze the codebase and build an interactive visualization.
      </p>
      {errMsg && <p className="text-sm text-red-400">{errMsg}</p>}
      <div className="flex gap-3 mt-2">
        <button
          onClick={startAnalyze}
          disabled={starting}
          className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50"
        >
          {starting ? "Starting..." : "▶ Generate Knowledge Graph"}
        </button>
        <a
          href={`/books/${bookId}`}
          className="px-5 py-2.5 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
        >
          ← Back to Book
        </a>
      </div>
    </div>
  );
}

export function KnowledgeGraphPage({ bookId, initialHighlight }: Props) {
  const {
    data,
    loading,
    error,
    activeJobId,
    refetch,
    rfNodes,
    rfEdges,
    viewMode,
    setViewMode,
    coverageFilter,
    setCoverageFilter,
    selectedNodeId,
    setSelectedNodeId,
    selectedNode,
    visibleLayers,
    toggleLayer,
    searchQuery,
    setSearchQuery,
    searchResults,
  } = useKnowledgeGraph(bookId);

  const [showTour, setShowTour] = useState(false);
  const [manualJobId, setManualJobId] = useState<string | null>(null);
  const [repoStatus, setRepoStatus] = useState<RepoStatus | null>(null);
  const [repoChecked, setRepoChecked] = useState(false);

  const currentJobId = manualJobId || activeJobId;

  const handleJobStarted = useCallback((jobId: string) => {
    setManualJobId(jobId);
  }, []);

  const handleAnalyzeComplete = useCallback(() => {
    setManualJobId(null);
    refetch();
  }, [refetch]);

  const checkRepoStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/books/${bookId}/repo-status`);
      if (res.ok) {
        const data: RepoStatus = await res.json();
        setRepoStatus(data);
      }
    } catch {}
    setRepoChecked(true);
  }, [bookId]);

  const handleCloneComplete = useCallback(async () => {
    setRepoStatus(null);
    setRepoChecked(false);
    try {
      const res = await fetch(`/api/books/${bookId}/analyze`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.jobId) {
        setManualJobId(data.jobId);
        return;
      }
    } catch {}
    refetch();
  }, [bookId, refetch]);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (viewMode === "module") {
        const fileNode = data?.nodes.find((n) => n.id.startsWith(nodeId + "/"));
        if (fileNode) {
          setSelectedNodeId(fileNode.id);
        }
      } else {
        setSelectedNodeId(nodeId);
      }
    },
    [viewMode, data, setSelectedNodeId],
  );

  const handleNavigate = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
    },
    [setSelectedNodeId],
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-56px)] gap-4">
        <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">
          Loading knowledge graph...
        </p>
      </div>
    );
  }

  if (currentJobId && !data) {
    return (
      <AnalyzeProgress
        bookId={bookId}
        jobId={currentJobId}
        onComplete={handleAnalyzeComplete}
      />
    );
  }

  if (error === "not_found" && !currentJobId) {
    if (!repoChecked) {
      checkRepoStatus();
      return (
        <div className="flex flex-col items-center justify-center h-[calc(100vh-56px)] gap-4">
          <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Checking repository status...</p>
        </div>
      );
    }

    if (repoStatus && !repoStatus.exists) {
      return (
        <RepoMissing
          bookId={bookId}
          status={repoStatus}
          onCloneComplete={handleCloneComplete}
        />
      );
    }

    return <EmptyState bookId={bookId} onJobStarted={handleJobStarted} />;
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-56px)] gap-4">
        <p className="text-sm text-red-400">
          Failed to load knowledge graph: {error}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      <GraphToolbar
        viewMode={viewMode}
        setViewMode={setViewMode}
        layers={data.layers}
        visibleLayers={visibleLayers}
        toggleLayer={toggleLayer}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
        onSearchSelect={handleNodeClick}
        stats={data.stats}
        tourCount={data.tours.length}
        onStartTour={() => setShowTour(true)}
        coverageFilter={coverageFilter}
        setCoverageFilter={setCoverageFilter}
      />

      <div className="flex flex-1 overflow-hidden relative">
        <div className="flex-1">
          <ReactFlowProvider>
            <GraphCanvas
              nodes={rfNodes}
              edges={rfEdges}
              onNodeClick={handleNodeClick}
            />
          </ReactFlowProvider>
        </div>

        {selectedNode && (
          <NodeDetailPanel
            node={selectedNode}
            data={data}
            bookId={bookId}
            onClose={() => setSelectedNodeId(null)}
            onNavigate={handleNavigate}
          />
        )}

        {showTour && data.tours.length > 0 && (
          <TourOverlay
            tours={data.tours}
            onStepChange={handleNodeClick}
            onExit={() => setShowTour(false)}
          />
        )}
      </div>
    </div>
  );
}
