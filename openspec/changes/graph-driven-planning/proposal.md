## Why

当前的新书创建流程存在**"认知倒置"**：`pyharness init` 仅基于目录结构让 Claude 猜测章节大纲，之后才运行 `pyharness analyze` 提取深层语义（Concept / Workflow / DataModel）。这导致章节规划缺乏深度认知——往往退化为"按文件夹写说明书"，完全没有利用到语义知识图谱中提取出的核心概念与依赖关系。

正确的流转应该是：**先有认知（知识图谱），再有规划（章节大纲），最后落地（内容生成）。** 这次改动将 init → analyze → plan 三阶段串联为一条完整的流水线，让章节规划基于图谱驱动，显著提升书籍的结构质量。

基于 2026 年 4 月前沿技术调研（Codebase-Memory [arXiv:2603.27277]、CodeCompass [arXiv:2602.20048]、LogicLens [arXiv:2601.10773]、Microsoft GraphRAG、DualGraph [arXiv:2602.13830]、Understand-Anything），本方案进一步引入五项优化：tree-sitter 确定性静态基座、社区检测+拓扑排序驱动章节结构、增量构建接口预留、双图分离（KG vs Outline）、图谱质量校验。

## What Changes

- **引入 tree-sitter 确定性静态基座**：在 LLM 分析之前，使用 tree-sitter 解析 AST 提取 imports/exports、call graph、class hierarchy，构建零 token 成本的确定性结构图。LLM 仅在此基础上做语义标注，预估 token 节省 40-60%。
- **重构 `pyharness init` 流水线**：从三阶段扩展为七阶段：scan → static_graph → skeleton_yaml → analyze → validate → graph_plan → final_yaml + outline。
- **社区检测 + 拓扑排序驱动章节结构**：`plan_from_graph()` 改为两阶段——先用 networkx Louvain 社区检测确定 Part 边界 + DEPENDS_ON 拓扑排序确定章节顺序（算法保证），再由 Claude 命名和润色（LLM 创意）。
- **双图分离**：新增 `chapter-outline.json` 与 `knowledge-graph.json` 并列存储，包含 algorithm metadata、kg_coverage 映射、uncovered_nodes。支持独立更新 outline 而不重建 KG。
- **图谱质量校验**：merge 后、plan 前执行确定性检查（孤立节点、悬空边、疑似重复、层分配异常、连通性），结果记入日志，严重问题推送到前端。
- **增量构建接口预留**：`plan_from_graph()` 接受 `completeness` 参数，`_merge_batches()` 支持 `existing_graph` 参数，为 v2 增量构建留空间。

## Capabilities

### New Capabilities
- `graph-driven-planner`: 基于知识图谱的章节规划。分为算法阶段（社区检测 + 拓扑排序 + 中心性分析）和 LLM 阶段（命名 + 润色 + 大纲生成）。输出 parts/chapters JSON + chapter-outline.json。
- `static-graph`: tree-sitter 确定性静态图构建。解析 AST 提取 imports/call graph/class hierarchy，支持 Python/TS/JS/Go/Rust/Java，不支持的语言 graceful fallback。可缓存到 `static-graph.json`。
- `graph-validate`: 确定性图谱质量校验。检查孤立语义节点、悬空边、疑似重复、层分配异常、连通性。纯 Python 无 LLM 调用。

### Modified Capabilities
- `project-init-cli`: init 流水线从三阶段扩展为七阶段（scan → static_graph → skeleton_yaml → analyze → validate → graph_plan → final_yaml + outline）。
- `chapter-planner`: 原有的 `plan_chapters()` 被替换为 `plan_from_graph()`，提示词从"让 LLM 决定一切"改为"算法预计算结构 + LLM 润色"。
- `book-creation-api`: SSE 日志新增 `static-graph`、`validate`、`graph-plan` 阶段标识。

## Impact

**后端 (pyharness)**
- 新增 `pyharness/static_graph.py` — tree-sitter 静态图构建
- 新增 `pyharness/graph_validate.py` — 确定性图谱质量校验
- 新增 `pyharness/phases/graph_plan.py` — 社区检测 + 拓扑排序 + LLM 驱动的章节规划
- `pyharness/init.py` — 重构为七阶段流水线
- `pyharness/phases/analyze.py` — 接收可选 StaticGraph 参数，优化 batch prompt
- `pyharness/runner.py` — 适配 chapter-outline.json，adjust analyze 触发逻辑
- `pyharness/schemas.py` — 新增 StaticGraph/StaticNode/StaticEdge/GraphWarning/AlgorithmicPlan/Community/ChapterOutline 数据模型

**新增依赖**
- `tree-sitter` + `tree-sitter-languages` (可选依赖，缺失时 fallback)
- `networkx` (社区检测 + 拓扑排序)

**前端 (web-app)**
- `web-app/components/TerminalLoader.tsx` — 进度展示新增 static-graph/validate/graph-plan 阶段
- `web-app/lib/load-knowledge.ts` — 新增 chapter-outline.json 加载
- 可选：书籍详情页展示覆盖率信息

**测试**
- 新增 `tests/test_static_graph.py` — tree-sitter 解析测试
- 新增 `tests/test_graph_validate.py` — 质量校验测试
- 新增 `tests/test_graph_plan.py` — 社区检测 + 拓扑排序 + LLM 规划测试
- 更新 `tests/test_init.py` — 七阶段流水线测试
