## ADDED Requirements

### Requirement: Graph data endpoint includes coverage flag
The `GET /api/books/[bookId]/graph-data` endpoint SHALL append an `isCovered: boolean` property to each returned node object. This property MUST be `false` if the node's ID is found in the `uncovered_nodes` array of the loaded outline, and `true` otherwise. If the outline is missing, `isCovered` SHALL default to `true`.

#### Scenario: Node is listed as uncovered
- **WHEN** `knowledge.outline.uncovered_nodes` includes "concept-payment"
- **THEN** the API response for the node with id "concept-payment" includes `"isCovered": false`

#### Scenario: Outline is unavailable
- **WHEN** `knowledge.outline` is null
- **THEN** all returned nodes include `"isCovered": true` (or the flag is omitted/implied true)
