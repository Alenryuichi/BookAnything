## ADDED Requirements

### Requirement: Init analyze phase uses static graph summaries
The init pipeline SHALL pass the `StaticGraph` produced during initialization into the analyze phase. When a batch file has usable static-graph coverage, the analyze prompt MUST summarize imports, declarations, inheritance, and call relationships from that graph instead of embedding the entire file contents.

#### Scenario: Static graph available for a batch file
- **WHEN** init builds a `StaticGraph` that contains structural data for `src/auth/service.ts`
- **THEN** the analyze batch prompt includes a structural summary for `src/auth/service.ts` and does not embed its full source text

#### Scenario: Static graph unavailable for a batch file
- **WHEN** a batch file has no usable static-graph coverage because extraction failed or the language is unsupported
- **THEN** the analyze phase falls back to the existing raw-source prompt path for that file instead of failing the init run
