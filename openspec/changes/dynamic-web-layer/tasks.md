## 1. Zod Schema 层 (chapter-schema)

- [x] 1.1 安装 zod 依赖到 web-app：`cd web-app && npm install zod`
- [x] 1.2 创建 `web-app/lib/schema.ts`，定义 `ChapterSectionSchema`（heading, content, code?, diagram?, callout?, table?）
- [x] 1.3 定义 `ChapterContentSchema`（chapter_id, title, subtitle, opening_hook, sections, key_takeaways, further_thinking, word_count, prerequisites 等）
- [x] 1.4 定义 `BookIndexEntrySchema` 和 `BookIndexSchema`（books 数组，每条含 id, name, description, language, chapterCount, writtenCount, lastUpdated, score, stats）
- [x] 1.5 从 schema 派生 TypeScript 类型：`export type ChapterContent = z.infer<typeof ChapterContentSchema>` 等，更新 `types.ts` 导出为 re-export
- [x] 1.6 导出 `parseChapterJson(raw: string): ChapterContent | null` 工具函数，内含 strip-markdown-fence + safeParse 逻辑，替代现有 `extractJson`

## 2. Book Index 索引 (book-index)

- [x] 2.1 创建 `scripts/rebuild-index.sh`：扫描 `knowledge/*/chapters/` 目录，读取 `projects/*.yaml` 匹配元数据，生成 `knowledge/index.json`
- [x] 2.2 实现 slug 派生逻辑：从 `projects/*.yaml` 的 `name` 字段生成 URL-safe ID（如 "深入理解 Claude Code" → "claude-code"）
- [x] 2.3 迁移 legacy flat `knowledge/chapters/` 到 `knowledge/深入理解 Claude Code/chapters/`（如果存在）
- [x] 2.4 在 `run.sh` 的 `step_analyze` 章节写入成功后，追加调用 index 更新逻辑（更新 writtenCount 和 lastUpdated）
- [x] 2.5 运行 rebuild 脚本，验证 `knowledge/index.json` 正确生成

## 3. Knowledge Loader 重构 (knowledge-loader)

- [x] 3.1 新增 `loadBookIndex()` 函数：读取 `knowledge/index.json`，用 `BookIndexSchema.safeParse` 校验
- [x] 3.2 新增 `resolveBookDir(bookId: string): string | null`：从 index 的 id→name 映射找到 `knowledge/{name}/` 目录
- [x] 3.3 重构 `loadChapters(bookId: string)`：用 `resolveBookDir` 定位目录，用 `parseChapterJson` 替代 `extractJson`
- [x] 3.4 重构 `loadParts(bookId: string)`：从 `projects/*.yaml` 中找到匹配 bookId 的项目文件，提取 Part 分组
- [x] 3.5 重构 `loadModules(bookId: string)`、`loadArchitecture(bookId: string)`、`loadRelationships(bookId: string)`
- [x] 3.6 移除 `KNOWLEDGE_PROJECT` 环境变量依赖（从 `next.config.ts` 和 `load-knowledge.ts` 中删除）
- [x] 3.7 更新 `loadKnowledge(bookId: string)` 顶层函数签名

## 4. Next.js 配置切换 (standalone)

- [x] 4.1 修改 `web-app/next.config.ts`：将 `output: "export"` 改为 `output: "standalone"`
- [x] 4.2 移除 `images: { unoptimized: true }`（standalone 模式支持图片优化）
- [x] 4.3 移除 `env.KNOWLEDGE_PROJECT` 配置
- [x] 4.4 添加 `redirects` 配置：`/chapters/:id` → `/books/:defaultBook/chapters/:id`，`/` → `/books`
- [x] 4.5 验证 `npm run build` 在 standalone 模式下成功，`npm run start` 可正常服务

## 5. API Routes (books-api)

- [x] 5.1 创建 `web-app/app/api/books/route.ts`：GET 返回 `loadBookIndex()`，支持 `?refresh=true` 触发重建
- [x] 5.2 创建 `web-app/app/api/books/[bookId]/chapters/route.ts`：GET 返回章节列表摘要（id, title, subtitle, word_count, sectionCount）
- [x] 5.3 创建 `web-app/app/api/books/[bookId]/chapters/[chapterId]/route.ts`：GET 返回完整章节 JSON
- [x] 5.4 统一错误处理：404 for not found，400 for bad params，500 for server error，格式 `{ "error": "..." }`
- [x] 5.5 手动测试 API：`curl localhost:3000/api/books`、`curl localhost:3000/api/books/claude-code/chapters` 等

## 6. 书架 UI (bookshelf-ui)

- [x] 6.1 创建 `/books` 书架首页 `web-app/app/books/page.tsx`：调用 `loadBookIndex()` 渲染书籍卡片网格
- [x] 6.2 设计书籍卡片组件：书名、描述、语言 badge、进度条（writtenCount/chapterCount）、分数、统计数据
- [x] 6.3 创建 `/books/[bookId]` 单书首页 `web-app/app/books/[bookId]/page.tsx`：复用现有 `page.tsx` 目录逻辑，改为接收 `bookId` 参数
- [x] 6.4 创建 `/books/[bookId]/chapters/[id]` 章节阅读页 `web-app/app/books/[bookId]/chapters/[id]/page.tsx`：复用现有章节渲染逻辑
- [x] 6.5 更新 Sidebar 组件：根据当前 bookId 动态加载章节列表
- [x] 6.6 更新根页面 `web-app/app/page.tsx`：改为重定向到 `/books`
- [x] 6.7 处理空状态：无书籍时显示引导页面

## 7. 搜索与导航适配

- [x] 7.1 更新 SearchClient：搜索范围限定到当前 bookId，搜索结果链接指向 `/books/[bookId]/chapters/[id]`
- [x] 7.2 更新 DependencyGraph 页面：按 bookId 加载关系数据
- [x] 7.3 更新所有内部链接：Sidebar、章节间导航、面包屑等，使用 `/books/[bookId]/...` 前缀

## 8. 部署与兼容

- [x] 8.1 更新 `scripts/preview.sh`：从 `npx serve out` 改为 `next start`
- [x] 8.2 更新 `scripts/visual-test.js`：从 serve static `out/` 改为启动 next server 再截图
- [x] 8.3 创建 `web-app/Dockerfile`：基于 Next.js standalone 模式的多阶段构建
- [x] 8.4 更新 `run.sh` 的 `step_build_site`：适配 standalone 模式（不再依赖 `out/` 目录）
- [x] 8.5 端到端验证：`npm run build && npm run start`，手动浏览所有页面确认功能正常

## 9. 清理与文档

- [x] 9.1 删除旧的 `/chapters/[id]` 和 `/modules/[id]` 路由文件（已被新路由替代）
- [x] 9.2 删除 `load-knowledge.ts` 中的 `extractJson`、`isValidModule` 等废弃函数（已被 schema 替代）
- [x] 9.3 更新 `CLAUDE.md` 和 `.claude/rules/repo-layout.md`：反映新的路由结构和 index.json
- [x] 9.4 更新 `.gitignore`：添加 `.next/standalone/` 相关条目
