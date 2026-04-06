import type { ChapterOutline } from "@/lib/schema";

interface Props {
  outline: ChapterOutline | null;
}

export function CoverageDashboard({ outline }: Props) {
  if (!outline) return null;

  const uncoveredCount = outline.uncovered_nodes?.length || 0;
  const coveredNodes = new Set<string>();
  
  outline.parts.forEach(p => {
    p.chapters.forEach(c => {
      (c.kg_coverage || []).forEach(id => coveredNodes.add(id));
    });
  });
  
  const totalCovered = coveredNodes.size;
  const totalSemanticNodes = totalCovered + uncoveredCount;
  
  if (totalSemanticNodes === 0) return null;

  const progress = Math.round((totalCovered / totalSemanticNodes) * 100);

  return (
    <div className="mb-12 p-6 rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold">Knowledge Graph Coverage</h3>
        <span className="text-sm font-medium text-muted-foreground">{progress}% Covered</span>
      </div>
      
      <div className="h-2.5 rounded-full bg-muted overflow-hidden mb-6">
        <div 
          className="h-full bg-green-500 transition-all duration-500 ease-out" 
          style={{ width: `${progress}%` }} 
        />
      </div>

      <div className="flex gap-8 text-sm">
        <div>
          <div className="text-2xl font-bold tracking-tight text-foreground">{totalCovered}</div>
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">Covered Concepts</div>
        </div>
        <div>
          <div className="text-2xl font-bold tracking-tight text-red-500/80">{uncoveredCount}</div>
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">Missing Concepts</div>
        </div>
      </div>

      {uncoveredCount > 0 && (
        <div className="mt-6 pt-6 border-t border-border/50">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Top Uncovered Nodes
          </h4>
          <div className="flex flex-wrap gap-2">
            {(outline.uncovered_nodes || []).slice(0, 15).map((nodeId) => {
              const name = nodeId.includes("/") ? nodeId.split("/").pop() : nodeId;
              return (
                <span key={nodeId} className="px-2.5 py-1 rounded bg-red-500/10 text-red-500 text-xs font-medium border border-red-500/20" title={nodeId}>
                  {name}
                </span>
              );
            })}
            {uncoveredCount > 15 && (
              <span className="px-2.5 py-1 rounded bg-muted text-muted-foreground text-xs font-medium">
                +{uncoveredCount - 15} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
