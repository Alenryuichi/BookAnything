## MODIFIED Requirements

### Requirement: CLAUDE.md as narrative index
The existing `CLAUDE.md` SHALL be restructured to serve as a narrative style guide and index. It MUST retain the writing style guidelines (70% text / 30% code, storytelling approach, chapter structure requirements, prohibited patterns). It MUST replace inline hard constraints (git rules, JSON format, path restrictions) with references to corresponding `.claude/rules/` files. It MUST NOT duplicate content that exists in `.claude/rules/`.

#### Scenario: Hard constraints replaced with references
- **WHEN** a developer reads `CLAUDE.md`
- **THEN** git safety rules reference `.claude/rules/git-safety.md` instead of being inline

#### Scenario: Writing style preserved
- **WHEN** the model reads `CLAUDE.md` during chapter generation
- **THEN** all narrative guidelines (opening hooks, word counts, section structure, mermaid requirements) are present

#### Scenario: No duplication with rules
- **WHEN** comparing `CLAUDE.md` content with `.claude/rules/` content
- **THEN** there is no duplicated constraint text between the two locations
