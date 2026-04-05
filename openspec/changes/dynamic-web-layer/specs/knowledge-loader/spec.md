## MODIFIED Requirements

### Requirement: Dynamic multi-book loading
`load-knowledge.ts` MUST 支持按 `bookId` 参数动态加载知识数据，替代现有的构建时单书加载模式。所有 `load*` 函数 MUST 接受 `bookId: string` 参数。

#### Scenario: Load specific book by ID
- **WHEN** 调用 `loadChapters("claude-code")`
- **THEN** 函数 MUST 读取 `knowledge/深入理解 Claude Code/chapters/` 下的所有 JSON 文件（通过 index.json 中的 slug→目录名映射）

#### Scenario: Load book not in index
- **WHEN** 调用 `loadChapters("nonexistent")`
- **THEN** 函数 MUST 返回空对象 `{}`，不 throw 异常

### Requirement: Remove KNOWLEDGE_PROJECT dependency
系统 MUST 移除对 `KNOWLEDGE_PROJECT` 环境变量的依赖。书籍选择 MUST 通过 URL 路径参数（`bookId`）而非环境变量决定。

#### Scenario: No environment variable needed
- **WHEN** web-app 启动时未设置 `KNOWLEDGE_PROJECT`
- **THEN** 所有页面 MUST 正常渲染，书籍选择由 URL 路由参数决定

### Requirement: Book directory resolution
系统 MUST 提供 `resolveBookDir(bookId: string): string | null` 函数，将 URL slug 映射到 `knowledge/` 下的实际目录路径。映射关系从 `knowledge/index.json` 读取。

#### Scenario: Slug to directory mapping
- **WHEN** `index.json` 中 `id: "claude-code"` 对应 `name: "深入理解 Claude Code"`
- **THEN** `resolveBookDir("claude-code")` MUST 返回 `knowledge/深入理解 Claude Code/` 的绝对路径

### Requirement: Book metadata loading
系统 MUST 提供 `loadBookIndex(): BookIndex` 函数，读取 `knowledge/index.json` 并返回校验过的书籍索引。

#### Scenario: Index loaded and cached
- **WHEN** 多次调用 `loadBookIndex()`
- **THEN** 函数 MUST 返回一致的结果，可选使用内存缓存避免重复 fs 读取

### Requirement: Parts loading per book
系统 MUST 支持按书加载 Part 分组信息。`loadParts(bookId: string)` MUST 从该书对应的 `projects/*.yaml` 读取 Part 和章节分组。

#### Scenario: Load parts for specific book
- **WHEN** 调用 `loadParts("claude-code")`
- **THEN** 函数 MUST 返回该书的 Part 分组数组，每个 Part 包含 `name`、`color`、`ids`
