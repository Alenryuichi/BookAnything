## ADDED Requirements

### Requirement: Graph nodes indicate coverage status
The graph visualization SHALL visually distinguish nodes that are covered by the generated chapters from those that are not. The coverage status MUST be determined by checking if the node's ID exists in the `uncovered_nodes` array of the `chapter-outline.json` payload. Nodes not present in this array are considered covered.

#### Scenario: Node is uncovered
- **WHEN** a user views a node in the graph that is listed in the `uncovered_nodes` array
- **THEN** the node is styled to indicate it is missing from the book (e.g., a warning color or specific border)

#### Scenario: Node is covered
- **WHEN** a user views a node in the graph that is NOT listed in the `uncovered_nodes` array
- **THEN** the node is styled with the default or "covered" visual state

### Requirement: Graph coverage filter
The graph interface SHALL provide a filter toggle to show "All", "Covered Only", or "Uncovered Only" nodes. When filtering, non-matching nodes SHALL be visually faded out or hidden.

#### Scenario: User filters to uncovered nodes
- **WHEN** a user selects "Uncovered Only" in the graph filter
- **THEN** only nodes listed in `uncovered_nodes` remain fully visible, while covered nodes are faded
