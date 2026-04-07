# Spec: Knowledge Graph Explorer Page

## Overview

New page at `/books/{bookId}/explore` that renders an interactive knowledge graph using React Flow. Users can explore the codebase visually, search for symbols, filter by architecture layer, and follow guided tours.

## Route

`web-app/app/books/[bookId]/explore/page.tsx`

Server component that:
1. Reads `bookId` from params
2. Checks if `knowledge-graph.json` exists (via fs or API check)
3. Renders `KnowledgeGraphPage` client component

## Data Flow

```
[explore/page.tsx]
    │
    ▼ (client component)
[KnowledgeGraphPage]
    │
    ├── useKnowledgeGraph(bookId)
    │       │
    │       ▼ fetch GET /api/books/{bookId}/knowledge-graph
    │       │
    │       ▼ transform to React Flow format
    │       │
    │       └── { rfNodes, rfEdges, layers, tours, stats }
    │
    ├── [GraphToolbar] — view mode, layer filter
    ├── [GraphSearch] — fuzzy search
    ├── [GraphCanvas] — React Flow instance
    ├── [NodeDetailPanel] — selected node info
    ├── [TourOverlay] — guided tour UI
    └── [LayerLegend] — color legend + stats
```

## React Flow Data Transformation

### `useKnowledgeGraph.ts`

```typescript
interface UseKnowledgeGraphReturn {
  loading: boolean;
  error: string | null;
  rfNodes: Node[];
  rfEdges: Edge[];
  layers: ArchLayer[];
  tours: GuidedTour[];
  stats: KnowledgeGraphStats;
  viewMode: "module" | "file" | "function";
  setViewMode: (mode: "module" | "file" | "function") => void;
  selectedNode: GraphNode | null;
  selectNode: (id: string) => void;
  searchResults: GraphNode[];
  search: (query: string) => void;
}
```

Transform rules by view mode:

**Module view:**
- Group file nodes by parent directory
- Each directory becomes a React Flow node with type `moduleNode`
- Position: Dagre layout (top-to-bottom or left-to-right)
- Edges: aggregate file→file edges to directory→directory, deduplicate
- Node data: directory name, file count, predominant layer color

**File view:**
- Each `GraphNode` (type=file) → React Flow node with type `fileNode`
- Position: Dagre layout
- Edges: import edges only
- Node data: file name, layer color, language icon, line count

**Function view:**
- File nodes expanded: each child (class/function) becomes a sub-node
- Use React Flow's group node feature: file as parent, children positioned inside
- All edge types shown
- Node data varies by type

### Layout Algorithm

Use `dagre` for automatic graph layout:

```typescript
import dagre from "dagre";

function layoutGraph(nodes: Node[], edges: Edge[], direction: "TB" | "LR" = "TB") {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep: 80, nodesep: 40 });
  
  nodes.forEach(n => g.setNode(n.id, { width: 200, height: 60 }));
  edges.forEach(e => g.setEdge(e.source, e.target));
  
  dagre.layout(g);
  
  return nodes.map(n => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 100, y: pos.y - 30 } };
  });
}
```

## Custom Node Components

### FileNode

```
┌────────────────────────────────┐
│ 🟣 auth/service.ts        ▸   │
│ TypeScript · 245 lines         │
│ "Handles user authentication"  │
└────────────────────────────────┘
```

- Left: layer color dot
- Right: expand toggle (▸ collapsed, ▾ expanded) — for function view
- Bottom row: language + line count
- Third row: summary (truncated to 1 line)
- Border color = layer color (subtle)

### ModuleNode

```
┌────────────────────────────┐
│ 📁 src/auth/               │
│ 5 files · Service Layer    │
└────────────────────────────┘
```

- Directory icon
- File count
- Dominant layer label

### ClassNode / FunctionNode (inside expanded file)

```
┌──────────────────────────┐
│ ⬡ AuthService            │
│ 3 methods                │
└──────────────────────────┘
```

```
┌──────────────────────────┐
│ ƒ login(email, password) │
└──────────────────────────┘
```

## Edge Styling

| Type | Style | Color |
|------|-------|-------|
| import | Solid, animated | `#64748b` (slate) |
| call | Dashed | `#3b82f6` (blue) |
| extend | Dotted, thick | `#8b5cf6` (violet) |
| implement | Dotted | `#10b981` (emerald) |
| compose | Solid, thin | `#f59e0b` (amber) |

All edges: show label on hover, animate on selection.

## Node Detail Panel

Right sidebar (320px width, collapsible):

### File Node Selected

```
┌─────────────────────────────────┐
│ ✕                               │
│                                 │
│ 🟣 auth/service.ts              │
│ Service Layer · TypeScript      │
│                                 │
│ ─── Summary ───                 │
│ Handles user authentication,    │
│ token generation, and session   │
│ management.                     │
│                                 │
│ ─── Contains ───                │
│ ⬡ AuthService (class, 3 methods)│
│ ƒ hashPassword (function)       │
│                                 │
│ ─── Imports ───                 │
│ → db/user-repo.ts               │
│ → lib/jwt.ts                    │
│                                 │
│ ─── Imported By ───             │
│ ← routes/login.ts               │
│ ← middleware/auth.ts             │
│                                 │
│ ─── Referenced In ───           │
│ 📖 Ch.3: Authentication         │
│ 📖 Ch.7: Security               │
└─────────────────────────────────┘
```

Each link is clickable:
- Imports/Imported By → centers graph on that node
- Contains → expands file and selects child
- Referenced In → navigates to chapter page

## Search

### GraphSearch Component

- Input field with `⌘K` keyboard shortcut to focus
- Powered by Fuse.js on flattened node list (files + classes + functions)
- Search keys: `name`, `summary`, `signature`
- Results dropdown: max 10 items, show icon + name + file path
- Click result → select node + center graph on it + open detail panel
- Escape → close search

### Layer Filter

Toggle chips in toolbar:
```
[🔵 API] [🟣 Service] [🟢 Data] [🟡 UI] [⚫ Infra] [🩷 Util]
```

Clicking a chip toggles visibility of all nodes in that layer. Hidden nodes and their edges are removed from the React Flow instance (not just visually hidden — improves performance).

## Tour Mode

### TourOverlay Component

Activated by clicking "🧭 Tours" in toolbar → dropdown to select a tour.

UI overlay:
```
┌─────────────────────────────────────────────────┐
│ 🧭 Architecture Overview          Step 3 of 8   │
│                                                   │
│ "The router module receives HTTP requests and     │
│  dispatches them to the appropriate handler.      │
│  Notice how it imports from both auth/ and api/." │
│                                                   │
│ [← Previous]              [Next →]    [✕ Exit]   │
└─────────────────────────────────────────────────┘
```

Behavior:
- Current tour node gets a pulsing ring CSS animation
- Graph auto-centers on current node with smooth animation
- Other nodes are dimmed (opacity 0.3) except neighbors
- Previous/Next buttons navigate through steps
- Exit button dismisses overlay and restores full graph

## URL Query Parameters

| Param | Effect |
|-------|--------|
| `?view=module\|file\|function` | Set initial view mode |
| `?highlight={nodeId}` | Auto-select and center on this node |
| `?tour={tourId}` | Auto-start this guided tour |
| `?search={query}` | Pre-fill search and show results |

These are used for deep linking from chapter pages and the dashboard.

## Responsive Behavior

- Desktop (>1024px): full layout with side panel
- Tablet (768-1024px): panel overlays as drawer from right
- Mobile (<768px): panel as bottom sheet, simplified node rendering

## Performance Constraints

- Graphs with < 500 nodes: render all nodes immediately
- Graphs with 500-2000 nodes: default to Module view, warn on File/Function view
- Graphs with > 2000 nodes: only Module view available, lazy-load file details on expand
- Use React Flow's `nodeTypes` memoization and `useCallback` for event handlers
- Virtualization: React Flow handles this internally for off-screen nodes

## Empty & Error States

**No graph file:**
```
┌─────────────────────────────────────┐
│                                     │
│   🔍 Knowledge Graph                │
│                                     │
│   No knowledge graph has been       │
│   generated for this book yet.      │
│                                     │
│   The knowledge graph provides an   │
│   interactive visualization of the  │
│   codebase's architecture.          │
│                                     │
│   [▶ Generate Knowledge Graph]      │
│                                     │
└─────────────────────────────────────┘
```

**Loading:**
Skeleton: toolbar placeholder + centered spinner + "Analyzing codebase structure..."

**Error:**
Red banner: "Failed to load knowledge graph. {error message}. [Retry]"
