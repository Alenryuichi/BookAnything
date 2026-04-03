"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Network } from "lucide-react";
import { DependencyGraph } from "./DependencyGraph";
import { loadKnowledge } from "@/lib/load-knowledge";

export function GraphModal({ bookId }: { bookId: string }) {
  const [open, setOpen] = useState(false);
  const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[]; layers: any[] } | null>(null);
  
  // To handle D3 rendering correctly, we only mount the graph after 
  // the dialog is open and has finished its animation.
  const [shouldRenderGraph, setShouldRenderGraph] = useState(false);

  useEffect(() => {
    // Listen for custom event to open the graph modal
    const handleOpenGraph = () => setOpen(true);
    document.addEventListener("open-graph-modal", handleOpenGraph);
    
    return () => {
      document.removeEventListener("open-graph-modal", handleOpenGraph);
    };
  }, []);

  // Fetch data only when opened
  useEffect(() => {
    if (!open || !bookId || graphData) return;
    
    // In a real app this would be a fetch to an API.
    // For now we simulate an API call to our own route, or we can fetch data directly 
    // since this is a client component but loadKnowledge is a server utility.
    // Since loadKnowledge is synchronous fs reading, it cannot be called directly here.
    // We'll fetch it from a dedicated API endpoint or let the parent pass it.
    
    const fetchGraphData = async () => {
      try {
        const res = await fetch(`/api/books/${bookId}/graph-data`);
        if (res.ok) {
          const data = await res.json();
          setGraphData(data);
        }
      } catch (err) {
        console.error("Failed to load graph data", err);
      }
    };
    
    fetchGraphData();
  }, [open, bookId, graphData]);

  // Delayed rendering for D3
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => setShouldRenderGraph(true), 300); // Wait for transition
      return () => clearTimeout(timer);
    } else {
      setShouldRenderGraph(false);
    }
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-[95vw] h-[90vh] max-w-7xl translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-background shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
            <Dialog.Title className="text-lg font-bold tracking-tight flex items-center gap-2 m-0">
              <Network className="w-5 h-5 text-muted-foreground" />
              架构依赖图
            </Dialog.Title>
            <Dialog.Close className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>
          
          <div className="flex-1 relative bg-background/50 overflow-hidden">
            {shouldRenderGraph && graphData && graphData.nodes.length > 0 ? (
              <DependencyGraph nodes={graphData.nodes} edges={graphData.edges} />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                {!graphData ? "加载中..." : "没有可用的架构数据"}
              </div>
            )}
            
            {/* Legend overlay */}
            {shouldRenderGraph && graphData && graphData.layers?.length > 0 && (
              <div className="absolute bottom-6 left-6 p-4 bg-background/80 backdrop-blur-md border border-border rounded-lg shadow-lg max-w-xs z-10">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">图例说明</h4>
                <div className="space-y-2">
                  {graphData.layers.map((layer: any) => (
                    <div key={layer.id} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: layer.color }} />
                      <span className="text-xs text-foreground font-medium">{layer.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
