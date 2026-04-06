# Specification: Semantic Knowledge Graph Core

## 1. Analysis Phase Sub-steps
File: `pyharness/phases/analyze.py`
- Modify the `run_analyze_phase` to sequentially execute:
  - `global_discovery()`
  - `semantic_mapping()`
  - `consolidation()`
- Update the output JSON schema to reflect the new node and edge types.

## 2. Pydantic Models Update
File: `pyharness/schemas.py`
- Update `KnowledgeGraph` model.
- Add `Node` type enum.
- Add `Edge` type enum.

## 3. Frontend Visualization Updates
File: `web-app/components/KnowledgeGraph/KnowledgeGraph.tsx`
- Implement styling per node type:
  - Concept: Purple
  - Workflow: Blue
  - DataModel: Green
  - Component: Orange
  - CodeEntity/File: Gray
- Add edge labels and styling.