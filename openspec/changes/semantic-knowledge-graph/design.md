# Design: Semantic Knowledge Graph

## Architecture Changes
The `analyze` phase will be split into three sub-phases:
1. **Global Discovery**: Scan the repository to extract all files and code entities (functions, classes).
2. **Semantic Mapping**: Use LLMs to identify broader `Concepts`, `Workflows`, `DataModels`, and `Components`.
3. **Consolidation**: Connect the entities with semantic edges (`IMPLEMENTS`, `MUTATES`, `TRIGGERS`, `DEPENDS_ON`) to build the final Knowledge Graph.

## Data Schema
- **Nodes**:
  - `id`: string
  - `type`: enum (`Concept`, `Workflow`, `DataModel`, `Component`, `CodeEntity`, `File`)
  - `label`: string
  - `metadata`: object
- **Edges**:
  - `source`: string
  - `target`: string
  - `type`: enum (`IMPLEMENTS`, `MUTATES`, `TRIGGERS`, `DEPENDS_ON`)
  - `metadata`: object

## Frontend Changes
- Update the KnowledgeGraph visualization component to use distinct visual styles (colors, shapes) for different node types.
- Render edge types appropriately (e.g., using labels on edges or different line styles).
- Add filtering by node/edge type.