## 0. 新增依赖与基础设施

- [x] 0.1 在 `requirements.txt` / `pyproject.toml` 中添加 `tree-sitter`, `tree-sitter-languages` (可选依赖), `networkx` 依赖
- [x] 0.2 新增 `pyharness/schemas.py` 中的 `StaticGraph`, `StaticNode`, `StaticEdge`, `GraphWarning`, `AlgorithmicPlan`, `Community` 数据模型
- [x] 0.3 新增 `ChapterOutline` schema（对应 `chapter-outline.json` 的结构：`parts[].chapters[]` + `kg_coverage` + `uncovered_nodes` + `algorithm` metadata）

## 1. Backend: tree-sitter 静态基座（优化 1）

- [x] 1.1 新建 `pyharness/static_graph.py`，实现 `build_static_graph(files: list[FileEntry], repo_path: Path) -> StaticGraph`：使用 tree-sitter 解析源文件，提取 imports/exports、function/class declarations、call edges、class inheritance
- [x] 1.2 实现语言适配器模式：每种语言（Python/TS/JS/Go/Rust/Java）各有一个 `_extract_{lang}(tree, source)` 函数返回统一的 `StaticNode` + `StaticEdge` 列表
- [x] 1.3 不支持的语言 graceful fallback：返回仅含 file 节点的空结构，不阻塞流水线
- [x] 1.4 可选缓存：将 StaticGraph 写入 `knowledge/static-graph.json`，带文件 mtime 哈希，仅变更文件时重建
- [x] 1.5 修改 `analyze.py` 的 `_build_batch_prompt()`：当有 StaticGraph 时，不再传入完整文件内容，改为传入 tree-sitter 提取的结构摘要（函数签名、import 列表、class 层级），LLM 只需补充语义标签
- [x] 1.6 为 `build_static_graph` 编写单元测试：Python/TS fixture files → 验证提取的 imports/classes/functions 数量和边关系

## 2. Backend: graph_plan 模块 — 社区检测 + 拓扑排序（优化 2）

- [x] 2.1 新建 `pyharness/phases/graph_plan.py`，实现 `extract_graph_summary(kg_path) -> GraphSummary`：读取 knowledge-graph.json，提取 Concept/Workflow/DataModel/Component 节点和语义边
- [x] 2.2 实现 `compute_algorithmic_plan(summary: GraphSummary) -> AlgorithmicPlan`：
  - 用 networkx 构建有向图（semantic 节点为 nodes，DEPENDS_ON/IMPLEMENTS/TRIGGERS 为 edges）
  - Louvain 社区检测 → `communities: list[Community]`（每个 community = 一个 Part 候选）
  - 社区内 DEPENDS_ON 拓扑排序 → `topo_order: list[str]`（如有环则断最弱边并 warn）
  - 节点中心性分析 → `centrality: dict[str, float]`（用于确定核心概念）
  - semantic 节点 < 5 时跳过社区检测，全部归入单个 Part
- [x] 2.3 实现 `build_graph_planning_prompt(plan: AlgorithmicPlan, summary: GraphSummary, scan: ScanResult) -> str`：将算法预计算的 Part 分组 + 拓扑排序 + 节点摘要组合为 Claude 提示词，指导 LLM 在此基础上命名、润色、补充大纲（不再让 LLM 决定分组和排序）
- [x] 2.4 实现 `plan_from_graph(kg_path, scan, repo_path, project_name, completeness=1.0) -> dict`：调用 compute_algorithmic_plan → build_graph_planning_prompt → ClaudeClient → 解析 JSON，失败时 fallback 到 `_generate_fallback_skeleton()`
- [x] 2.5 为 `compute_algorithmic_plan` 编写单元测试：构造 mock GraphSummary → 验证 community 分组、topo 排序、环检测
- [x] 2.6 为 `plan_from_graph` 编写单元测试：mock ClaudeClient 返回值 → 验证 prompt 结构、JSON 解析、fallback 逻辑

## 3. Backend: 双图分离 — chapter-outline.json（优化 5）

- [x] 3.1 `plan_from_graph()` 返回值同时写入 `chapter-outline.json`（包含 algorithm metadata、kg_coverage 映射、uncovered_nodes）
- [x] 3.2 新增 `load_chapter_outline(knowledge_dir: Path) -> ChapterOutline | None` 工具函数
- [x] 3.3 `pyharness run` 的 Plan 阶段检查 `chapter-outline.json`：存在时优先使用（只更新 outline 而不重建 KG），不存在时 fallback 到当前逻辑
- [x] 3.4 前端 `load-knowledge.ts` 增加 `chapter-outline.json` 加载逻辑，用于展示覆盖率信息（`uncovered_nodes` 数量）

## 4. Backend: Graph Reviewer 质量校验（优化 6）

- [x] 4.1 新建 `pyharness/graph_validate.py`，实现 `validate_graph(graph: KnowledgeGraph) -> list[GraphWarning]`：
  - 检查孤立语义节点（Concept/Workflow/DataModel 无任何边）
  - 检查悬空边（source/target 不在 node_map）
  - 检查疑似重复（两个 Concept 名称 normalized edit distance > 0.85）
  - 检查层分配异常（file 节点 layer 与路径启发式推断不一致）
  - 检查连通性（semantic 子图多个连通分量 → info 提示）
- [x] 4.2 在 init 流水线中，`_merge_batches()` 之后调用 `validate_graph()`，结果记入日志
- [x] 4.3 严重问题（>30% 语义节点孤立）触发 warning log event 到 SSE 前端
- [x] 4.4 为 `validate_graph` 编写单元测试：构造含各种问题的 mock graph → 验证检测到的 warning 类型和数量

## 5. Backend: 重构 init 流水线

- [x] 5.1 在 `pyharness/init.py` 中新增 `generate_skeleton_yaml(scan, output_dir, remote_url)` 函数：生成不含 chapters 字段的骨架 YAML
- [x] 5.2 新增 `update_yaml_chapters(yaml_path, plan)` 函数：将 graph-plan 输出的 chapters 追加写入已有的骨架 YAML
- [x] 5.3 重构 `init_project()` 为七阶段流水线：scan → static_graph → skeleton_yaml → analyze → validate → graph_plan → final_yaml + outline，每个阶段通过 `hlog()` 发出带 phase 标签的进度日志
- [x] 5.4 构造临时 HarnessRunner 实例供 `step_analyze` 使用（仅传 config + knowledge_dir，不获取 lock）
- [x] 5.5 `step_analyze` 接口修改：接收可选 `static_graph: StaticGraph | None` 参数，有值时用于优化 batch prompt
- [x] 5.6 处理 knowledge-graph.json 已存在时跳过 analyze 的逻辑
- [x] 5.7 处理 analyze 失败时的 graceful fallback（退回 `_generate_fallback_skeleton`，但静态图仍可用于基础展示）
- [x] 5.8 更新 `tests/test_init.py`：验证新的七阶段流水线、骨架 YAML 生成、chapters 回写、outline 生成

## 6. Backend: runner 适配

- [x] 6.1 调整 `runner.py` 中 `run()` 方法的 analyze 触发逻辑：init 已生成图谱时跳过，保留 `--reanalyze` 强制重新分析的能力
- [x] 6.2 `plan` 阶段优先读取 `chapter-outline.json`，利用 `uncovered_nodes` 信息优化重规划
- [x] 6.3 确保 `pyharness run` 在有图谱但无章节时仍能正常工作（edge case）

## 7. 前端: 进度展示适配

- [x] 7.1 更新 `web-app/components/TerminalLoader.tsx` 中的 SIMULATED_LOGS 列表，加入 static-graph、analyze、validate、graph-plan 阶段的模拟日志
- [x] 7.2 验证 SSE 模式下新增的 phase tag（`static-graph`, `analyze`, `validate`, `graph-plan`）日志事件能正确显示
- [x] 7.3 `web-app/app/api/books/route.ts` 无需改动（init 命令不变，内部流程变化），确认兼容性
- [x] 7.4 可选：在书籍详情页显示 `chapter-outline.json` 中的覆盖率信息（`uncovered_nodes` 数量 badge）

## 8. 端到端验证

- [x] 8.1 运行 `python3 -m pyharness init tests/e2e/fixture-repo`，验证完整流水线：static graph → 骨架 YAML → knowledge-graph.json → graph validation → 图谱驱动章节 → 最终 YAML + chapter-outline.json
- [x] 8.2 验证生成的 YAML 可被 `load_project_config()` 正常加载，chapters 数量 > 0
- [x] 8.3 验证 `chapter-outline.json` 存在且包含 `algorithm`、`kg_coverage`、`uncovered_nodes` 字段
- [x] 8.4 运行 Playwright E2E 测试（smoke + wizard + kg-progress），确保前端兼容
- [x] 8.5 在浏览器中手动验证：创建新书 → 观察多阶段进度 → 最终书籍页面显示章节
