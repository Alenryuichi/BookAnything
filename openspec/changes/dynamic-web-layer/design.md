## Context

当前 web-app 是一个 Next.js 16 静态站点（`output: "export"`），构建时通过 `load-knowledge.ts` 直接用 `fs.readFileSync` 读取 `knowledge/` 目录下的章节 JSON，烘焙为 HTML 输出到 `out/` 目录。

关键文件和依赖关系：
- `web-app/next.config.ts`: 设置 `output: "export"` + `KNOWLEDGE_PROJECT` 环境变量
- `web-app/lib/load-knowledge.ts`: 构建时读取 `knowledge/{项目名}/chapters/*.json`，包含 `extractJson` 等容错逻辑
- `web-app/lib/types.ts`: `ChapterContent`、`ModuleAnalysis`、`KnowledgeBase` 等类型定义
- `web-app/app/page.tsx`: 首页（当前直接调用 `loadKnowledge()` 同步函数）
- `web-app/app/chapters/[id]/page.tsx`: 章节阅读页
- `run.sh`: 写入 `knowledge/{项目名}/chapters/{chapter-id}.json`，由 headless Claude 生成

存储格式：每本书的数据在 `knowledge/{书名}/chapters/` 下，但目前也有 flat `knowledge/chapters/` 的 legacy 兼容路径。`projects/*.yaml` 定义书的元数据和章节目录。

## Goals / Non-Goals

**Goals:**
- 将 web-app 从纯静态导出改为 Node.js 运行时模式（`standalone`），启用 API Routes
- 实现多书浏览：一个站点可动态切换和展示多本书
- 提供 RESTful API，为后续书籍管理和实时写书引擎奠定基础
- 统一章节 JSON 校验：用 Zod schema 替代分散的 `extractJson` + 手动检查
- 保持现有阅读体验不退化（Mermaid、代码高亮、搜索、暗色模式）

**Non-Goals:**
- 不实现书籍创建/写入 API（属于 Phase 2 书籍管理）
- 不实现实时进度推送（属于 Phase 3 实时引擎）
- 不引入数据库（继续使用文件系统存储）
- 不改动 `run.sh` 编排逻辑（仅在章节写入后追加 index 更新）
- 不实现用户认证（属于 Phase 5 平台化）

## Decisions

### D1: Next.js 输出模式改为 `standalone`

**选择**: `output: "standalone"` 而非移除 `output` 配置

**理由**: `standalone` 模式生成自包含的 Node.js 服务，不依赖 `node_modules`，适合 Docker 部署。同时完整支持 API Routes、SSR、ISR。

**替代方案**:
- 完全移除 `output`（默认模式）— 需要完整 `node_modules`，部署体积大
- 保留 `export` + 用 middleware 模拟 API — 静态导出不支持 middleware

### D2: `knowledge/index.json` 作为书籍索引

**选择**: 在 `knowledge/` 根目录维护一个 `index.json`，包含所有书的元数据

**理由**: 避免每次 API 请求都扫描 `knowledge/` 子目录 + 解析 `projects/*.yaml`。索引由 `run.sh` 在章节写入后自动更新，也可由脚本手动重建。

**格式**:
```json
{
  "books": [
    {
      "id": "claude-code",
      "name": "深入理解 Claude Code",
      "description": "AI 编程助手 CLI 工具",
      "language": "TypeScript",
      "chapterCount": 14,
      "writtenCount": 14,
      "lastUpdated": "2025-06-15T10:30:00Z",
      "score": 85,
      "stats": { "files": 1900, "lines": 512000 }
    }
  ]
}
```

**替代方案**: 每次请求动态扫描 — 慢且 fragile；用 SQLite — 引入数据库依赖过早

### D3: 路由结构 `/books/[bookId]/chapters/[id]`

**选择**: 多层嵌套路由，bookId 使用 URL-safe 的 slug（从项目名派生）

**理由**: 清晰的 URL 命名空间，支持直接分享章节链接。`bookId` 对应 `knowledge/{bookName}/` 的目录名转 slug。

**URL 映射**:
- `/books` → 书架首页（所有书）
- `/books/claude-code` → 单本书首页（目录）
- `/books/claude-code/chapters/ch01-what-is-claude-code` → 章节阅读
- `/api/books` → 书籍列表 API
- `/api/books/claude-code/chapters` → 章节列表 API
- `/api/books/claude-code/chapters/ch01-what-is-claude-code` → 章节内容 API

**替代方案**: 保持 `/chapters/[id]` + query param `?book=xxx` — URL 不够语义化；`/[bookId]/[chapterId]` 两层 — 与其他页面（search/graph）路径冲突

### D4: `load-knowledge.ts` 重构为按需加载

**选择**: 保留 `load-knowledge.ts` 但重构为支持 `bookId` 参数的按需加载函数，同时保持对 Server Components 的兼容

**理由**: Next.js App Router 的 Server Components 可以直接调用 fs，无需走 API。页面级 SSR 直接调用 `loadChapters(bookId)`，API Routes 也复用同一套加载逻辑。

**关键变化**:
- `loadChapters()` → `loadChapters(bookId: string)`
- `loadKnowledge()` → `loadKnowledge(bookId: string)`
- `loadBookTitle()` → 从 `index.json` 读取
- 移除 `KNOWLEDGE_PROJECT` 环境变量依赖
- 新增 `loadBookIndex()` 读取 `knowledge/index.json`
- 新增 `resolveBookDir(bookId)` 将 slug 映射到 `knowledge/{目录名}/`

**替代方案**: 全部改为 client-side fetch + API — 失去 SSR 的 SEO 和首屏性能优势

### D5: Zod schema 统一校验

**选择**: 在 `web-app/lib/schema.ts` 定义 Zod schema，同时用于 API 响应类型和章节 JSON 校验

**理由**: 替代当前分散的 `extractJson` + `isValidModule` + `toStr` 等手动校验逻辑。Zod 提供运行时校验 + TypeScript 类型推导，schema 可导出给 `run.sh`（TypeScript 重写后）复用。

**替代方案**: JSON Schema — 需要额外的校验库，与 TypeScript 类型系统集成差；保持现状 — `extractJson` 做法脆弱，无法保证字段完整性

### D6: 兼容 legacy flat knowledge/ 路径

**选择**: 在索引重建脚本中自动检测 flat `knowledge/chapters/` 并迁移到 `knowledge/{default}/chapters/`

**理由**: 现有 `knowledge/chapters/` 目录包含已生成的 Claude Code 书章节，不能丢失。迁移后统一为 namespaced 模式。

**替代方案**: 在 `loadChapters` 中保留 fallback 逻辑 — 增加代码复杂度，两种模式永远共存

## Risks / Trade-offs

**[部署复杂度增加]** → 从 `npx serve out` 变为 `next start` 需要 Node.js 运行时。缓解：提供 `Dockerfile` 和 `docker-compose.yaml`；同时保留 `next build && next export` 作为降级选项

**[首次加载性能]** → SSR 模式下首次请求需要 Node.js 渲染，比静态文件服务慢。缓解：对书架页和章节页使用 ISR（revalidate: 60），热路径缓存在内存中

**[URL 破坏性变更]** → `/chapters/[id]` → `/books/[bookId]/chapters/[id]` 会导致旧链接失效。缓解：在 `next.config.ts` 中配置 redirects，将 `/chapters/:id` 重定向到默认书

**[index.json 一致性]** → 如果 `run.sh` 写入章节后未更新 index，API 返回的数据会过时。缓解：API 端点增加 `?refresh=true` 参数触发即时重建；`loadBookIndex` 增加 stale 检测（对比目录 mtime）

**[legacy 数据迁移]** → flat `knowledge/chapters/` 迁移可能影响现有 git history。缓解：迁移脚本用 `git mv` 保留历史；`run.sh` 的 `CHAPTERS_DIR` 已经是 namespaced 路径，不受影响
