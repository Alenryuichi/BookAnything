## Why

当前 web-app 使用 `output: "export"` 纯静态导出模式，所有章节内容在 `next build` 时烘焙为 HTML。这导致：无法在运行时读取新增章节（每次写完都要重新 build）、无法提供 API Routes（静态模式不支持）、无法多书切换（环境变量 `KNOWLEDGE_PROJECT` 绑定单本书）、无法从网页管理书籍（无后端能力）。ROADMAP Phase 1 要求将网站从静态阅读器进化为带 API 层的动态应用，这是实现后续书籍管理、实时写书引擎、平台化的前提。

## What Changes

- 移除 `next.config.ts` 中的 `output: "export"`，改为 `standalone` 模式
- 新增 `knowledge/index.json` 书籍元数据索引，由 harness 写入时自动维护
- 新增 API Routes：`GET /api/books`（书籍列表）、`GET /api/books/[bookId]/chapters`（章节列表）、`GET /api/books/[bookId]/chapters/[chapterId]`（单章节内容）
- 新增书架首页 `/books`，列出所有书籍，显示封面、进度、分数
- 改造 `load-knowledge.ts`：从构建时 fs 读取改为运行时按需读取，支持多书动态切换
- 改造现有阅读器路由：从 `/chapters/[id]` 改为 `/books/[bookId]/chapters/[id]`，支持多书 URL 命名空间
- 新增 Zod schema 校验层，在 API 和构建时统一校验章节 JSON 格式
- **BREAKING**: 现有 `/chapters/[id]` URL 路径将改为 `/books/[bookId]/chapters/[id]`

## Capabilities

### New Capabilities
- `book-index`: `knowledge/index.json` 元数据索引的生成、更新和读取逻辑
- `books-api`: REST API 层（书籍列表、章节 CRUD 读取），基于 Next.js API Routes
- `bookshelf-ui`: 书架首页 `/books`，多书浏览和切换
- `chapter-schema`: Zod schema 定义，用于 API 响应校验和构建时章节 JSON 校验

### Modified Capabilities
- `knowledge-loader`: 现有 `load-knowledge.ts` 需从静态构建时加载改为运行时动态加载，支持按 bookId 参数读取

## Impact

- **web-app/next.config.ts**: 移除 `output: "export"`，改为 `standalone`
- **web-app/lib/load-knowledge.ts**: 重构为支持多书动态读取
- **web-app/app/**: 新增 `/books` 页面、`/books/[bookId]/chapters/[id]` 路由、`/api/books` API Routes
- **knowledge/**: 新增 `index.json` 索引文件
- **部署方式**: 从纯静态文件服务（`npx serve out`）变为需要 Node.js 运行时（`next start`）
- **run.sh**: 需在写入章节后更新 `knowledge/index.json`（小改动）
- **不影响**: `projects/*.yaml`、`goals.yaml`、`.claude/` 能力层、评估逻辑
