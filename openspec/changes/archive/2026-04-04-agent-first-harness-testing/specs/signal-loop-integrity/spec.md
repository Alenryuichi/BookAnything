## ADDED Requirements

### Requirement: Eval issues propagate to improve prompt
The test suite SHALL verify that component-level issues from eval (e.g., "[web-app/components/MermaidDiagram.tsx] mermaid.js 未加载") appear in the structured diagnostic blocks passed to the improve prompt.

#### Scenario: Mermaid issue propagates
- **WHEN** report.json has mermaid jsLoaded=false and eval produces a MermaidDiagram.tsx issue
- **THEN** `_build_diagnostic_blocks()` SHALL produce a block with component="MermaidDiagram" and file="web-app/components/MermaidDiagram.tsx"

#### Scenario: Code block issue propagates
- **WHEN** report.json has preTagCount=0 and eval produces a CodeBlock.tsx issue
- **THEN** the diagnostic block SHALL contain "CodeBlock" with status="broken"

### Requirement: Fix hints match eval suggestions
The test suite SHALL verify that the `fix_hint` in diagnostic blocks is consistent with the suggestions from eval — they should reference the same component and the same root cause.

#### Scenario: Eval suggestion matches fix hint
- **WHEN** eval suggests "确保 mermaid 库在客户端通过 dynamic import 加载"
- **THEN** the corresponding diagnostic block's fix_hint SHALL reference "dynamic import" or "mermaid.initialize"

### Requirement: Score impact ordering is correct
The diagnostic blocks SHALL be ordered by score impact: mermaid (8pt) before code (5pt) before search (4pt).

#### Scenario: Blocks ordered by impact
- **WHEN** all three components are broken
- **THEN** the first block SHALL have score_impact containing "8 points" and the last SHALL have "4 points"

### Requirement: End-to-end signal chain
Given a fixed report.json → eval → improve prompt, the test SHALL verify the complete chain: report diagnostics → eval issues with file paths → diagnostic blocks with fix hints → improve prompt text containing the file paths.

#### Scenario: Full chain test
- **WHEN** a test report.json with all components broken is processed
- **THEN** the final improve prompt SHALL contain all three component file paths and at least one fix hint per component
