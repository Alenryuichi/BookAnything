# BookAnything — ROADMAP

> 把任何仓库变成一本交互式技术书。

---

## 现状分析 (As-Is)

### 架构概览

```
用户 ─── run.sh (CLI) ──→ Claude (headless) ──→ knowledge/{project}/chapters/*.json
                                                          │
                                                          ▼
                                                   web-app/ (Next.js)
                                                   output: "export" (纯静态)
                                                          │
                                                          ▼
                                                   out/ → npx serve
```

### 已有能力

| 能力 | 实现方式 | 成熟度 |
|------|---------|--------|
| 项目扫描 & 章节规划 | `new-project.sh` → Claude 分析源码 → 生成 `projects/*.yaml` | ★★★☆☆ |
| 迭代写书循环 | `run.sh`：Plan → Write(并行) → Improve → Review → Build → Test → Eval | ★★★★☆ |
| 章节 JSON 生成 | Claude subagent，遵循 `chapter-json-contract.md` | ★★★★☆ |
| 多维评估 | 内容(40) + 视觉(35) + 交互(25) = 100 分 | ★★★☆☆ |
| Web 阅读器 | Next.js 静态站，支持目录/搜索/Mermaid/代码高亮/暗色模式 | ★★★★☆ |
| Git 检查点 | 每轮迭代自动 commit knowledge/ | ★★★☆☆ |

### 核心局限

1. **纯 CLI 驱动** — 必须在终端运行 `run.sh`，无 Web 管理界面
2. **纯静态导出** — `next.config.ts` 设置 `output: "export"`，build 时烘焙内容，无 API 层
3. **单书单构建** — 环境变量 `KNOWLEDGE_PROJECT` 决定当前书，切换需重新 build
4. **无章节 CRUD** — 不能从网页增删改章节，不能触发重写
5. **无实时反馈** — 写书过程是黑盒（`run.sh` 日志），用户无法看到进度
6. **无多用户** — 无认证、无个人书架

---

## Harness 范式研究总结

### 什么是 Harness

Harness（测试线束/编排框架）是 AI 系统中用于**编排、执行和评估** agent 工作的运行时框架。核心特征：

| 范式要素 | 说明 | 本项目对应 |
|---------|------|-----------|
| **Orchestration Loop** | 迭代循环：计划→执行→评估→改进 | `run.sh` 主循环 |
| **Multi-Agent** | 多个专门化 agent 并行/串行协作 | Plan/Write/Review/Eval 四类 agent |
| **Evaluation Harness** | 多维度自动评分 + 质量门控 | 三维评分(100分) + pass_threshold |
| **State Management** | 跨迭代的状态持久化 | `state.json` + git checkpoint |
| **Sandboxed Execution** | 每个 agent 只能操作限定范围 | `path-boundaries.md`、allowed-tools |
| **Self-Improvement** | 根据评估反馈自动改进 | webapp-review 根据 eval feedback 修 bug |

### 业界参考

- **SWE-bench Harness**: 隔离的 Docker 容器 → 运行 agent → 跑测试验证 → 打分。强调 *可复现性* 和 *自动验证*。
- **Anthropic Claude Code Harness**: supervisor-worker 模型，context handoff，hooks/rules/skills 三层治理。
- **METR Task Standard**: 标准化 agent task spec（输入/输出/评分/安全约束），强调仅通过测试不够，需要人工审查。
- **Devin/OpenHands**: 全栈 agent 执行环境，包含编辑器/终端/浏览器 sandbox。

### 本项目的独特价值

与上述 benchmark/coding agent 不同，BookAnything 是一个 **知识合成 harness** — 不是让 agent 修 bug，而是让 agent **理解代码并讲述故事**。这要求：

1. **深度阅读能力** — 不是 grep 到修改，而是理解设计意图
2. **叙事能力** — 70% 文字 30% 代码，比喻、场景、Mermaid 图
3. **多轮打磨** — 不是一次生成，而是迭代优化直到达标
4. **最终产物是给人看的** — 不是通过测试即可，需要阅读体验好

---

## ROADMAP

### Phase 0 — 基础加固 (Foundation Hardening)

> 稳定现有 CLI 流程，为 Web 化做准备。

| 编号 | 任务 | 优先级 | 说明 |
|------|------|--------|------|
| 0.1 | **多书知识库结构统一** | P0 | 消除 flat `knowledge/` vs `knowledge/{name}/` 双模式，统一为 namespaced 模式 |
| 0.2 | **书籍元数据索引** | P0 | 新增 `knowledge/index.json`，列出所有书的名称、状态、章节数、最后更新时间 |
| 0.3 | **章节 JSON schema 验证** | P1 | 用 JSON Schema 或 Zod 在 build 和 write 时自动校验，取代松散的 `extractJson` |
| 0.4 | **评分校准** | P1 | 当前 eval 由 LLM 自评，易虚高。增加基于规则的硬指标（字数、sections 数、Mermaid 语法校验） |
| 0.5 | **run.sh → TypeScript 重写** | P2 | 将 harness 逻辑从 bash 迁移到 TS/Node，获得类型安全、更好的错误处理、更易集成 Web 层 |

### Phase 1 — 动态 Web 化 (Dynamic Web Layer)

> 从静态导出转为带 API 的动态站点，支持多书浏览。

```
┌─────────────────────────────────────────────────────┐
│                   BookAnything Web                    │
│                                                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  书架页   │  │  阅读器(现有) │  │  管理后台     │  │
│  │  /books   │  │  /books/:id  │  │  /dashboard   │  │
│  └──────────┘  └──────────────┘  └───────────────┘  │
│                       │                              │
│               ┌───────┴────────┐                     │
│               │   API Routes   │                     │
│               │  /api/books    │                     │
│               │  /api/chapters │                     │
│               │  /api/generate │                     │
│               └───────┬────────┘                     │
│                       │                              │
│            ┌──────────┴──────────┐                   │
│            │  knowledge/ (fs)    │                    │
│            │  projects/ (yaml)   │                    │
│            └─────────────────────┘                   │
└─────────────────────────────────────────────────────┘
```

| 编号 | 任务 | 优先级 | 说明 |
|------|------|--------|------|
| 1.1 | **移除 `output: "export"`** | P0 | 改为 `standalone` 或默认模式，启用 API Routes |
| 1.2 | **书架首页 `/books`** | P0 | 列出 `knowledge/` 下所有书，显示封面、进度、分数，点击进入阅读 |
| 1.3 | **API: GET /api/books** | P0 | 读取 `knowledge/index.json`，返回书籍列表 |
| 1.4 | **API: GET /api/books/:id/chapters** | P0 | 动态读取章节 JSON，不再需要 build 时烘焙 |
| 1.5 | **动态路由改造** | P1 | `chapters/[id]` 从 `generateStaticParams` 改为 SSR/ISR，支持新增章节热加载 |
| 1.6 | **部署适配** | P2 | 支持 `docker-compose` 一键部署（Node server + 文件卷挂载 knowledge/） |

### Phase 2 — 书籍管理 (Book Management)

> 在网页上管理书的生命周期：创建、编写、编辑、删除。

| 编号 | 任务 | 优先级 | 说明 |
|------|------|--------|------|
| 2.1 | **创建新书向导** | P0 | Web UI：输入仓库 URL/路径 → 后端执行 `new-project.sh` 逻辑 → 展示章节规划 → 确认创建 |
| 2.2 | **API: POST /api/books** | P0 | 接收仓库路径，调用 Claude 扫描，生成 `projects/*.yaml` + `knowledge/{name}/` |
| 2.3 | **章节目录编辑器** | P1 | 可视化编辑章节顺序、标题、大纲、sources；拖拽排序；增删章节 |
| 2.4 | **单章节重写** | P0 | 点击「重写」按钮 → 调用 Claude 重新生成该章节 → 实时预览 diff |
| 2.5 | **章节删除** | P1 | 删除章节 JSON，更新 index |
| 2.6 | **批量操作** | P2 | 选中多个章节批量重写、批量删除 |
| 2.7 | **版本历史** | P2 | 基于 git checkpoint，展示每个章节的历史版本，支持回滚 |

### Phase 3 — 实时写书引擎 (Live Generation Engine)

> 从后台批处理进化为实时可视的写书过程。

```
用户点击「开始写书」
       │
       ▼
  ┌──────────────────────────────────────────┐
  │          Live Generation Pipeline         │
  │                                          │
  │  Planning ──→ Writing ──→ Building ──→   │
  │     │           │           │            │
  │     ▼           ▼           ▼            │
  │   SSE/WS     SSE/WS     SSE/WS          │
  │     │           │           │            │
  └─────┼───────────┼───────────┼────────────┘
        │           │           │
        ▼           ▼           ▼
  ┌─────────────────────────────────────┐
  │     Web Dashboard (实时进度)         │
  │                                     │
  │  [■■■■■□□□□□] 5/10 章节完成         │
  │                                     │
  │  ● ch01 ✓ 3200字 · 28分            │
  │  ● ch02 ✓ 4100字 · 35分            │
  │  ◐ ch03   写作中... (1800/3500字)   │
  │  ○ ch04   等待中                    │
  │  ○ ch05   等待中                    │
  │                                     │
  │  [暂停] [跳过 ch03] [重写 ch01]     │
  └─────────────────────────────────────┘
```

| 编号 | 任务 | 优先级 | 说明 |
|------|------|--------|------|
| 3.1 | **后端 Job 队列** | P0 | 将 `run.sh` 逻辑封装为 Node.js job（BullMQ / 内存队列），支持启动/暂停/取消 |
| 3.2 | **SSE/WebSocket 进度推送** | P0 | 写书过程实时推送：当前阶段、章节进度、字数、耗时 |
| 3.3 | **Dashboard 进度面板** | P0 | 可视化写书进度，每个章节状态独立显示 |
| 3.4 | **快速写书模式** | P1 | 跳过 webapp-improve/review/visual-test，只做 Plan → Write → Basic Eval |
| 3.5 | **交互式控制** | P1 | 写书过程中可暂停、跳过某章、插队重写、调整并行数 |
| 3.6 | **增量构建** | P2 | 新增/修改章节后只重新构建受影响的页面，不全量 rebuild |

### Phase 4 — 智能增强 (AI-Powered Enhancements)

> 用更强的 AI 能力提升书的质量和用户体验。

| 编号 | 任务 | 优先级 | 说明 |
|------|------|--------|------|
| 4.1 | **AutoResearch 子任务** | P1 | 写书前先用 subagent 做 deep research：阅读 README、issues、PR、设计文档 |
| 4.2 | **智能章节规划 v2** | P1 | 基于依赖图 + 认知负荷理论自动规划章节顺序和分组 |
| 4.3 | **跨章节一致性检查** | P1 | 检查术语统一、引用正确、前后章衔接自然 |
| 4.4 | **AI 编辑器** | P2 | 选中段落 → 右键「重写/扩展/简化/加比喻」→ Claude 即时改写 |
| 4.5 | **自动插图** | P2 | 自动生成章节的架构图、流程图、数据流图（Mermaid + SVG） |
| 4.6 | **多语言支持** | P2 | 支持生成中文/英文/日文版本，基于同一章节 JSON 做翻译 |
| 4.7 | **读者反馈循环** | P3 | 读者可对章节打分/评论 → 低分章节自动进入重写队列 |

### Phase 5 — 平台化 (Platform)

> 从单机工具进化为 SaaS 平台。

| 编号 | 任务 | 优先级 | 说明 |
|------|------|--------|------|
| 5.1 | **用户认证** | P0 | GitHub OAuth 登录，个人书架 |
| 5.2 | **Git 集成** | P0 | 输入 GitHub URL → 自动 clone → 扫描 → 写书 |
| 5.3 | **公开书架** | P1 | 用户可选择将书公开，形成社区图书馆 |
| 5.4 | **自定义域名** | P2 | 每本书可绑定独立域名 (xxx.bookanything.dev) |
| 5.5 | **协作编辑** | P2 | 多人共同编辑一本书（类 Notion） |
| 5.6 | **导出格式** | P1 | 导出为 PDF、ePub、Markdown、静态站 |
| 5.7 | **API 开放** | P2 | 提供 REST/GraphQL API，支持第三方集成 |
| 5.8 | **模板系统** | P2 | 不同类型的书用不同写作模板（源码书、API 文档书、教程书） |

---

## 里程碑规划

```
2026 Q2          2026 Q3          2026 Q4          2027 Q1
   │                │                │                │
   ▼                ▼                ▼                ▼
Phase 0+1        Phase 2+3        Phase 4          Phase 5
基础+动态化       管理+实时引擎     AI增强            平台化
   │                │                │                │
   │ ★ 多书浏览     │ ★ Web创建书    │ ★ AutoResearch  │ ★ GitHub集成
   │ ★ API层        │ ★ 章节CRUD     │ ★ AI编辑器      │ ★ 用户认证
   │ ★ schema校验   │ ★ 实时进度     │ ★ 一致性检查    │ ★ 公开书架
   │                │ ★ 快速模式     │ ★ 多语言        │ ★ 导出PDF
```

### M0: 可浏览 (2026-Q2)

- 网站支持多书切换，不需要重新 build
- API Routes 就位
- 章节 JSON schema 验证

### M1: 可管理 (2026-Q3 早期)

- 在网页上创建新书（输入仓库路径 → 自动规划）
- 单章节重写、删除
- 章节顺序拖拽编辑

### M2: 可观察 (2026-Q3 中期)

- 写书过程实时可视
- Dashboard 显示进度、分数、耗时
- 快速写书模式（跳过 visual test 等）

### M3: 更智能 (2026-Q4)

- AutoResearch：写书前先深度研究仓库
- 跨章节一致性检查
- AI 段落级编辑

### M4: 平台化 (2027-Q1)

- GitHub OAuth + 个人书架
- GitHub URL → 一键写书
- 公开书架 & 社区

---

## 技术决策记录

### 为什么从静态导出切换到动态模式？

**现状**：`output: "export"` 将所有内容在 build 时烘焙为 HTML。每次新增章节都需要重新 `next build`。

**问题**：
- 无法在运行时读取新增的章节
- 无法提供 API（API Routes 在 export 模式下不可用）
- 多书切换需要不同的 `KNOWLEDGE_PROJECT` 重新 build

**方案**：改为 `standalone` 模式 + ISR（增量静态再生）或纯 SSR。章节 JSON 作为文件系统数据源在运行时按需读取。

### 为什么要 `run.sh` → TypeScript 重写？

`run.sh` 目前有 1143 行 bash，包含：
- 命令行参数解析
- YAML 手动解析（sed/grep，脆弱）
- 并行进程管理（bash 数组 + wait）
- JSON 操作（jq，macOS 需额外安装）
- 复杂字符串模板（heredoc prompt 构建）

迁移到 TypeScript 可获得：
- 类型安全 + 更好的 YAML/JSON 解析
- 与 Web 层共享代码（types、评估逻辑）
- 更可靠的并行控制（Promise.all + AbortController）
- 更好的错误处理和日志
- 可以同时作为 CLI 和 API 后端使用

### 存储选型

当前阶段保持 **文件系统存储**（knowledge/ 目录 + JSON 文件），原因：
- 简单、可 git 版本控制
- 与现有流程兼容
- 本地开发友好

未来平台化时迁移到 **SQLite/PostgreSQL** + S3 对象存储。

---

## 设计原则

1. **CLI-first 但 Web-friendly** — CLI 流程始终可用，Web 是加分项不是必须项
2. **渐进增强** — 每个 Phase 独立可交付，不需要一步到位
3. **数据即真相** — `knowledge/` 目录下的 JSON 是唯一数据源，UI 只是展示层
4. **Harness 可插拔** — 写作/评估/改进 agent 可独立替换或升级
5. **开箱即用** — `git clone && npm install && npm run dev` 就能看到已有的书
