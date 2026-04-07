# Proposal: Knowledge Graph — Harness-Level Code Understanding

## Problem

BookAnything 目前只能"讲故事"（章节文本），不能"画地图"（代码结构可视化）。用户看完一本书后，仍然无法回答：

- 这个仓库的核心模块有哪些？它们之间怎么连接的？
- `AuthService` 被哪些文件调用了？它依赖什么？
- 从入口文件到数据库层，调用链是什么样的？

现有的 `DependencyGraph` 组件已经具备 D3 力导向图渲染能力，但 **没有数据** —— `knowledge/{bookId}/` 下只有 `chapters/`，没有结构化的代码分析产物。

## Solution

在 pyharness 中新增 **`analyze` 阶段**，作为 harness 一等公民：

```
init → [analyze] → run(plan → write → improve → review → build → visual_test → eval)
        ^^^^^^^^
        新增阶段
```

`analyze` 阶段使用 Claude CLI 对目标仓库进行深度代码分析，输出 `knowledge/{bookId}/knowledge-graph.json`。前端新增 `/books/{bookId}/explore` 页面，用 React Flow 渲染可交互的知识图谱。

## Architecture

### Data Pipeline

```
Target Repo (source code)
       │
       ▼
┌──────────────────────────────────────────────────┐
│  pyharness analyze (新增阶段)                      │
│                                                    │
│  Step 1: Tree Scanner                              │
│    • 遍历文件树，过滤 .gitignore / binary          │
│    • 按语言分类，统计行数                           │
│    • 输出: file_inventory.json                     │
│                                                    │
│  Step 2: Deep Analyzer (Claude CLI, 并行)          │
│    • 每批 10-15 个文件送入 Claude                   │
│    • 提取: 模块、类、函数、import/export            │
│    • 生成: 自然语言摘要、架构层分类                  │
│    • 输出: 合并为 knowledge-graph.json              │
│                                                    │
│  Step 3: Relationship Resolver                     │
│    • 基于 import 路径 → 解析真实依赖边              │
│    • 推断调用关系 (call)、继承关系 (extend)         │
│    • 识别架构层: API / Service / Data / UI / Infra  │
│    • 标注入口点、高扇入/扇出节点                    │
│                                                    │
│  Step 4: Tour Builder                              │
│    • 基于拓扑排序生成 "Guided Tours"               │
│    • 按架构层、按功能域、按依赖深度三种路线          │
└──────────────────────────────────────────────────┘
       │
       ▼
knowledge/{bookId}/knowledge-graph.json
       │
       ▼
┌──────────────────────────────────────────────────┐
│  Web App: /books/{bookId}/explore                  │
│                                                    │
│  React Flow 交互式图谱                             │
│  ┌─────────────────────────────────────┐          │
│  │ 🔍 搜索 [________________]  [架构] │          │
│  │                                     │          │
│  │     ┌─────┐   ┌──────┐            │          │
│  │     │ App │──→│Router│            │          │
│  │     └──┬──┘   └──┬───┘            │          │
│  │        │         │                 │          │
│  │     ┌──▼──┐   ┌──▼────┐           │          │
│  │     │Auth │   │Handler│           │          │
│  │     │Svc  │   │       │           │          │
│  │     └─────┘   └───────┘           │          │
│  │                                     │          │
│  │  [模块视图] [文件视图] [函数视图]    │          │
│  └─────────────────────────────────────┘          │
│                                                    │
│  节点详情面板:                                      │
│  - 自然语言摘要                                    │
│  - 代码签名                                        │
│  - 依赖 & 被依赖列表                               │
│  - 所属章节链接                                    │
│  - 架构层标签                                      │
└──────────────────────────────────────────────────┘
```

### knowledge-graph.json Schema

```json
{
  "version": "1.0",
  "repo": "https://github.com/org/repo",
  "generated_at": "2026-04-05T12:00:00Z",
  "stats": {
    "total_files": 142,
    "total_functions": 387,
    "total_classes": 45,
    "total_edges": 612
  },
  "layers": [
    { "id": "api", "name": "API Layer", "color": "#3b82f6" },
    { "id": "service", "name": "Service Layer", "color": "#8b5cf6" },
    { "id": "data", "name": "Data Layer", "color": "#10b981" },
    { "id": "ui", "name": "UI Layer", "color": "#f59e0b" },
    { "id": "infra", "name": "Infrastructure", "color": "#6b7280" },
    { "id": "util", "name": "Utilities", "color": "#ec4899" }
  ],
  "nodes": [
    {
      "id": "src/auth/service.ts",
      "type": "file",
      "name": "auth/service.ts",
      "layer": "service",
      "summary": "Handles user authentication, token generation, and session management.",
      "language": "typescript",
      "line_count": 245,
      "children": [
        {
          "id": "src/auth/service.ts::AuthService",
          "type": "class",
          "name": "AuthService",
          "summary": "Manages JWT token lifecycle and integrates with OAuth providers.",
          "signature": "class AuthService",
          "line_start": 15,
          "line_end": 240,
          "children": [
            {
              "id": "src/auth/service.ts::AuthService::login",
              "type": "function",
              "name": "login",
              "summary": "Validates credentials and returns a signed JWT token pair.",
              "signature": "async login(email: string, password: string): Promise<TokenPair>",
              "line_start": 42,
              "line_end": 78
            }
          ]
        }
      ]
    }
  ],
  "edges": [
    {
      "source": "src/auth/service.ts",
      "target": "src/db/user-repo.ts",
      "type": "import",
      "label": "imports UserRepository"
    },
    {
      "source": "src/routes/login.ts::handleLogin",
      "target": "src/auth/service.ts::AuthService::login",
      "type": "call",
      "label": "calls login()"
    }
  ],
  "tours": [
    {
      "id": "architecture-overview",
      "name": "Architecture Overview",
      "description": "从入口到数据库的完整请求链路",
      "steps": [
        { "node_id": "src/index.ts", "narrative": "应用入口，初始化 Express 服务器..." },
        { "node_id": "src/routes/index.ts", "narrative": "路由注册中心..." }
      ]
    }
  ],
  "chapter_links": {
    "src/auth/service.ts": ["ch03-authentication"],
    "src/db/user-repo.ts": ["ch04-data-layer", "ch03-authentication"]
  }
}
```

### Pyharness Integration

**New subcommand:** `python -m pyharness analyze --project projects/xxx.yaml`

**New phase module:** `pyharness/phases/analyze.py`

Phase behavior:
1. Read `config.repo_path` to locate the target repository
2. Walk the file tree (respecting `.gitignore`), build `file_inventory`
3. Batch files into groups of 10-15, invoke Claude CLI in parallel (up to `max_parallel`)
4. Each Claude call returns structured JSON: nodes + edges + summaries for that batch
5. Merge all batches into unified `knowledge-graph.json`
6. Run a resolution pass to deduplicate edges and resolve cross-file references
7. Generate guided tours via a final Claude call
8. Write `knowledge/{bookId}/knowledge-graph.json`

**Integration with `run` loop:**
- `analyze` runs **once** before the first iteration (or on `--reanalyze` flag)
- If `knowledge-graph.json` already exists, skip (unless `--reanalyze`)
- The `plan` phase can read the graph to make smarter chapter plans
- The `write` phase can reference the graph for accurate code citations

### Web App Changes

| Change | Details |
|--------|---------|
| New page: `/books/{bookId}/explore` | React Flow-based knowledge graph explorer |
| New API: `GET /api/books/{bookId}/knowledge-graph` | Serves `knowledge-graph.json` |
| Upgrade `GraphModal` | Replace D3 force graph with React Flow, reuse explore page components |
| Node detail panel | Click a node → side panel shows summary, code, dependencies, chapter links |
| Search + filter | Fuzzy search by name, filter by layer/type, highlight matching subgraph |
| View modes | Module (collapsed), File, Function — three zoom levels |
| Tour mode | Step-by-step guided walkthrough with narrative per node |
| Chapter ↔ Graph links | In chapter reader: code blocks link to graph nodes. In graph: nodes link to chapters |

## Scope

### In Scope

- `pyharness/phases/analyze.py` — 新增分析阶段
- `pyharness/schemas.py` — 新增 `KnowledgeGraph`, `GraphNode`, `GraphEdge`, `GuidedTour` 模型
- `pyharness/__main__.py` — 新增 `analyze` 子命令
- `pyharness/runner.py` — 在 run loop 第一轮之前调用 `analyze`（如果图谱不存在）
- `web-app/app/books/[bookId]/explore/page.tsx` — 知识图谱浏览页
- `web-app/components/KnowledgeGraph/` — React Flow 图谱组件族
- `web-app/app/api/books/[bookId]/knowledge-graph/route.ts` — 图谱数据 API
- 升级 `GraphModal.tsx` 和 `DependencyGraph.tsx` → 复用新组件
- 章节阅读器中的代码块 → 图谱节点链接

### Out of Scope

- 增量分析（文件变更后只重新分析变更文件）— Phase 2
- 实时分析（watch 模式）— Phase 2
- 跨仓库依赖分析 — 未来
- 自然语言问答（"auth 是怎么工作的？"）— 可作为后续迭代

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 大型仓库（10k+ 文件）分析时间过长 | 分析可能需要 30min+ | 智能过滤（只分析源码，跳过 vendor/generated）；并行批处理；进度推送到 dashboard |
| Claude CLI 单次调用的上下文窗口不够放 15 个文件 | 分析质量下降 | 动态调整批大小（按总行数而非文件数），大文件单独分析 |
| 知识图谱 JSON 体积过大（大型仓库可能 10MB+） | 前端加载慢 | 分层加载：先加载模块级摘要，点击展开时按需加载函数级细节 |
| 节点 ID 变化（文件重命名/重构后）导致 chapter_links 失效 | 章节链接断裂 | 用文件路径 + 函数名作为 ID，chapter_links 在每次 analyze 后自动重新匹配 |

## Success Metrics

1. 创建一本新书后，`knowledge/{bookId}/knowledge-graph.json` 自动生成
2. `/books/{bookId}/explore` 页面可正常渲染图谱，节点可点击
3. 搜索功能可以在 200ms 内找到任意函数/类
4. 至少生成 1 条 Guided Tour
5. 章节内的代码块可以链接到图谱中对应节点

## Alternatives Considered

### A: 纯静态分析（不用 Claude）
用 tree-sitter 或 LSP 做 AST 解析，不需要 LLM。
**否决原因**：只能得到语法级依赖，无法生成自然语言摘要和智能层级分类。我们的核心价值是"让 AI 帮你理解代码"，不是做另一个 IDE 的 symbol browser。

### B: 集成 Understand-Anything 作为插件
直接复用 Understand-Anything 的 agent 管线。
**否决原因**：它是 Claude Code 插件生态的产物，绑定了特定的插件安装方式和 agent 定义格式。我们的 pyharness 有自己的 Claude CLI 调用管线和数据格式，硬集成会引入不必要的耦合。但可以**借鉴**其多 agent 分工和 knowledge-graph schema 设计。

### C: 在 `init` 阶段一起做分析
不新增独立的 `analyze` 阶段，而是在 `init` 时就生成知识图谱。
**否决原因**：`init` 目前只需要 15-30 秒（快速扫描 + 章节规划），深度分析会让它变成 5-15 分钟。分离为独立阶段更灵活——用户可以先看到章节规划，再决定是否做深度分析。
