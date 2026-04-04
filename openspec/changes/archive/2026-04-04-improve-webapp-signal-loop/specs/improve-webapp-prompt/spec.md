## ADDED Requirements

### Requirement: Structured diagnostic input block
The `step_improve_webapp()` function in `run.sh` SHALL construct a structured diagnostic section in the prompt that presents each broken component as a JSON object. Each object MUST include: `component` (display name), `file` (relative path), `status` ("BROKEN" or "DEGRADED" or "OK"), `diagnosis` (concrete failure description from eval issues), and `fix_hint` (specific suggestion from eval). This section SHALL replace the current generic "常见问题和修复方向" numbered list.

#### Scenario: All three components broken
- **WHEN** mermaid, code highlighting, and search all have zero scores
- **THEN** the prompt SHALL contain three diagnostic objects, each with status "BROKEN", a specific diagnosis, and a targeted fix_hint

#### Scenario: Some components working
- **WHEN** code highlighting scores > 0 but mermaid and search score 0
- **THEN** the prompt SHALL contain mermaid and search as "BROKEN" and code highlighting as "OK", and the LLM SHALL be instructed to skip OK components

#### Scenario: No eval data available (first iteration)
- **WHEN** no previous eval JSON exists
- **THEN** the prompt SHALL fall back to a general instruction to check all three components, with file paths still included

### Requirement: Priority ordering by score impact
The diagnostic objects in the prompt SHALL be ordered by potential score impact (highest possible points first). The ordering MUST be: mermaid (8 points), code highlighting (5 points), search results (4 points for cards). This ensures the LLM addresses the highest-value fix first within its token/time budget.

#### Scenario: Standard priority ordering
- **WHEN** all three components are broken
- **THEN** mermaid diagnostic SHALL appear first, code highlighting second, search third

### Requirement: Console errors forwarded to prompt
The prompt SHALL include any console errors from the visual test report that are relevant to the broken components. Console errors MUST be filtered to remove noise (e.g., favicon 404s) and grouped by component relevance. This gives the LLM direct error messages to debug against.

#### Scenario: Mermaid console errors present
- **WHEN** `report.json` contains console errors matching `/mermaid/i` on chapter pages
- **THEN** those errors SHALL appear in the mermaid diagnostic object under a `console_errors` field

#### Scenario: No relevant console errors
- **WHEN** console errors exist but none match known component patterns
- **THEN** the prompt SHALL include them in a separate "Other console errors" section

### Requirement: Prompt removes generic guidance
The prompt SHALL NOT contain the current generic checklist items (e.g., "搜索不工作: 检查 search 页面的数据加载和过滤逻辑"). All guidance MUST be derived from actual diagnostic data. The only static content SHALL be the role description, path constraints, and output format instructions.

#### Scenario: No hardcoded fix suggestions
- **WHEN** the prompt is generated
- **THEN** the "常见问题和修复方向" section SHALL not exist; all fix guidance SHALL come from the eval's diagnostic issues and suggestions

### Requirement: Output format unchanged
The `step_improve_webapp()` prompt SHALL continue to request the same JSON output format from the LLM: `{"changes_made": [...], "files_modified": [...], "issues_fixed": [...], "issues_remaining": [...]}`. The LLM invocation parameters (tools, max tokens) SHALL remain unchanged.

#### Scenario: Output format consistency
- **WHEN** the LLM completes the improve_webapp step
- **THEN** the output JSON SHALL have the same schema as today, ensuring downstream steps (code review, etc.) are unaffected
