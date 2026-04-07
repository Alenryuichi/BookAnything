## Context

当前 `pyharness init` 的流水线是 scan → plan_chapters (Claude) → generate_yaml，一步到位生成完整 YAML。其中 `plan_chapters()` 使用的信息仅有：目录树（2层）、文件计数、语言检测等浅层结构信息。Claude 需要自己通过 Read/Glob 工具去探索源码后"脑补"章节。

同时，`pyharness analyze`（`step_analyze`）能进行多轮深度分析：Global Discovery 提取 Concept/Workflow/DataModel 抽象节点，Batch Analysis 为每个文件提取语义关系（IMPLEMENTS / MUTATES / TRIGGERS / DEPENDS_ON），最终输出一份结构化的 `knowledge-graph.json`。

**核心矛盾**：章节规划发生在知识图谱生成之前，图谱的深层语义无法反哺大纲设计。

**2026.04 前沿对标**：

多篇前沿论文（Codebase-Memory [arXiv:2603.27277]、CodeCompass [arXiv:2602.20048]、LogicLens [arXiv:2601.10773]）达成共识：代码理解应分为"确定性静态层"（tree-sitter/AST）和"LLM 语义层"两层。Microsoft GraphRAG 的 Leiden community detection + hierarchical summaries 被广泛用于知识图谱的主题聚类。DualGraph [arXiv:2602.13830] 提出将"知识探索图"与"大纲结构图"显式分离。Understand-Anything 项目在 pipeline 末端引入 Graph Reviewer agent 做质量校验。

**当前约束**：
- `step_analyze` 依赖 `HarnessRunner` 实例（config, knowledge_dir, resolved_repo_path）
- init 流程目前直接运行 `init_project(repo_path)`，无 runner 实例
- 前端 `POST /api/books` 只触发一个 `pyharness init` 命令

## Goals / Non-Goals

**Goals:**
- init 结束时，`knowledge-graph.json` 已存在，`project.yaml` 的 chapters 字段已基于图谱生成
- 用户无需额外手动触发"生成知识图谱"步骤
- 前端创建向导展示清晰的多阶段进度（Clone → Scan → Analyze → Plan → Done）
- `pyharness run` 启动时知识图谱已存在，不再需要首次分析
- 知识图谱包含 tree-sitter 提取的确定性静态结构（imports/call graph/class hierarchy）作为基座，LLM 仅负责语义标注
- 章节分组（Part）基于图谱社区检测算法，章节排序基于 DEPENDS_ON 拓扑排序，LLM 负责命名和润色而非决定结构
- 知识图谱（knowledge-graph.json）与章节大纲（chapter-outline.json）显式分离，支持独立更新
- 图谱合并后经过确定性质量校验（孤立节点、边合理性检查），不合格时产出警告

**Non-Goals:**
- 不改变 `pyharness run` 的主循环结构（Plan → Write → Review → Evaluate）
- 不引入交互式章节编辑（用户手动调整大纲），留给后续迭代
- 不修改前端知识图谱可视化组件（KnowledgeGraph explorer）
- 不引入 Neo4j 等外部图数据库，保持文件级 JSON 存储
- 不实现完整的流式/增量 KG 构建（v2 方向），但接口需为增量留空间

## Decisions

### Decision 1: 在 init 流程内串联 static-graph + analyze + graph-plan

**选项 A**：init 命令内部直接调用 `build_static_graph` + `step_analyze` + `plan_from_graph`
**选项 B**：将 init 拆为多个独立子命令，由前端逐个触发

**选择 A**。理由：
- 保持 CLI 接口简洁（`pyharness init /path` 一命令做完所有事）
- 前端不需要串联多个 API 调用，仍然是一次 `POST /api/books` 触发一个 Job
- SSE 日志流足够展示多阶段进度，不需要拆 Job

**实现方式**：在 `init_project()` 中：
1. Phase 1: `scan_repo()` — 基础扫描（与现有一致）
2. Phase 2: `build_static_graph()` — tree-sitter 解析出确定性结构图（imports/exports, call graph, class hierarchy），零 token 成本
3. Phase 3: `generate_skeleton_yaml()` — 生成不含 chapters 的 YAML 骨架
4. Phase 4: 构造临时 HarnessRunner，调用 `step_analyze(runner)` — LLM 语义标注叠加到静态图之上
5. Phase 5: `validate_graph()` — 确定性质量校验（孤立语义节点、异常边、重复实体检测）
6. Phase 6: `plan_from_graph()` — 社区检测 + 拓扑排序 → LLM 润色 → 章节大纲
7. Phase 7: 将 chapters 回写到 YAML（`update_yaml_chapters()`），同时写入 `chapter-outline.json`

### Decision 2: 引入 tree-sitter 确定性静态基座（优化 1）

**参考**: Codebase-Memory [arXiv:2603.27277] 报告 tree-sitter 构建的确定性 KG 在结构性问题上 token 消耗降低 10 倍。LLMSCAN 项目证明了 AST → call graph 作为 LLM 前置层的有效性。

**架构**：
```
scan_file_tree()
       ↓
build_static_graph(files, repo_path)    ← 新增，tree-sitter
       ↓ StaticGraph (imports, call edges, class hierarchy)
step_analyze(runner, static_graph)      ← 修改：接收静态图作为输入
       ↓ KnowledgeGraph (静态 + 语义)
plan_from_graph(...)
```

**新增 `pyharness/static_graph.py`**，包含：
- `build_static_graph(files: list[FileEntry], repo_path: Path) -> StaticGraph`
- 使用 `py-tree-sitter` + `tree-sitter-languages` 解析
- 提取：imports/exports, function/class declarations, call edges, class inheritance
- 输出 `StaticGraph` dataclass（nodes + edges，与 KnowledgeGraph 同构但类型为 `static_import` / `static_call` / `static_inherits`）

**对 analyze.py 的影响**：
- `_build_batch_prompt()` 不再需要传入完整文件内容让 LLM 自己提取 imports/children
- 改为传入 tree-sitter 已提取的结构摘要，LLM 只需补充语义标签（Concept/Workflow/DataModel labels, summaries）
- 预估 token 节省 40-60%

**Fallback**: 如果 tree-sitter 对某语言不支持，退回当前 LLM-only 路径。`build_static_graph` 返回 partial 结果而非失败。

### Decision 3: 社区检测 + 拓扑排序驱动章节结构（优化 2）

**参考**: Microsoft GraphRAG 使用 Leiden 社区检测做层级聚类。KnowLP [arXiv:2506.22303] 提出 dual-structure（prerequisite + similarity）图。DualGraph [arXiv:2602.13830] 验证了 KG 拓扑与大纲结构的 cross-signal。

`plan_from_graph()` 改为 **两阶段**:

**阶段 A: 算法阶段**（确定性，纯 Python，networkx）
1. 构建有向图：Concept/Workflow/DataModel 为节点，DEPENDS_ON/IMPLEMENTS/TRIGGERS 为边
2. Louvain/Leiden 社区检测 → 社区 = Part 主题边界
3. 社区内 DEPENDS_ON 拓扑排序 → 章节排序约束（DAG，如有环则断最弱边）
4. 输出 `AlgorithmicPlan`：`communities: list[Community]`, `topo_order: list[str]`, `centrality: dict[str, float]`

**阶段 B: LLM 润色阶段**（创意，Claude）
- 输入：AlgorithmicPlan + 节点摘要 + 项目 metadata
- 任务：为每个 Part 命名、为每个 Chapter 写标题/副标题/大纲、调整可选顺序
- **不再**让 LLM 决定分组和排序（由算法保证 prerequisite 约束）

**依赖**: `networkx` (已在 Python 标准生态，MIT license)，可选 `python-igraph` / `cdlib` 做更高级的 Leiden。

### Decision 4: 双图分离 — knowledge-graph.json vs chapter-outline.json（优化 5）

**参考**: DualGraph [arXiv:2602.13830] — 将知识探索图与大纲结构图显式分离，通过 cross-signal 协同演化。

**文件结构**:
```
knowledge/
├── knowledge-graph.json      ← 语义知识图谱（不变）
└── chapter-outline.json      ← 新增：章节结构 + 对 KG 的覆盖映射
```

**`chapter-outline.json` schema**:
```json
{
  "version": "1.0",
  "generated_at": "...",
  "algorithm": {
    "community_method": "louvain",
    "num_communities": 4,
    "topo_sort_valid": true
  },
  "parts": [
    {
      "part_num": 1,
      "part_title": "...",
      "community_id": "c0",
      "kg_node_ids": ["concept-pipeline", "concept-stage"],
      "chapters": [
        {
          "id": "ch01-...",
          "title": "...",
          "kg_coverage": ["concept-pipeline", "workflow-text-processing"],
          "prerequisites": [],
          "topo_rank": 0
        }
      ]
    }
  ],
  "uncovered_nodes": ["concept-unused-feature"]
}
```

**好处**:
- `pyharness run` 的 Plan 阶段可以只更新 outline 而不重建 KG
- `uncovered_nodes` 字段支持覆盖率分析（"KG 中哪些 Concept 还没有章节覆盖？"）
- 前端可展示覆盖率仪表盘

### Decision 5: Graph Reviewer — 确定性质量校验（优化 6）

**参考**: Understand-Anything 在 pipeline 末端放置 Graph Reviewer agent 检查连通性、边合理性、语义一致性。

在 `_merge_batches()` 之后、`plan_from_graph()` 之前，新增 `validate_graph()`:

```python
def validate_graph(graph: KnowledgeGraph) -> list[GraphWarning]:
    """Deterministic quality checks. No LLM calls."""
```

**检查项**:
1. **孤立语义节点**: Concept/Workflow/DataModel 节点无任何边连接 → 可能遗漏了关系
2. **悬空边**: 边的 source 或 target 不在 node_map 中 → 数据不一致
3. **疑似重复**: 两个 Concept 名称相似度 > 0.85（normalized edit distance）→ 建议合并
4. **层分配异常**: file 节点 layer 与其路径启发式推断不一致 → 可能 LLM 标错
5. **连通性**: 如果 semantic 子图存在多个连通分量，发出 info 级别提示

**输出**: `list[GraphWarning]`，记入日志，不阻塞流水线。严重问题（>30% 节点孤立）触发 warning log event 到 SSE。

### Decision 6: 增量构建接口预留（优化 4）

**参考**: iText2KG [arXiv:2409.03284] 的增量实体提取 + 图集成模式。ATOM [EACL 2026] 的原子事实分解方法。

当前 v1 仍为串行全量构建，但关键接口设计为增量友好：

```python
async def plan_from_graph(
    kg_path: Path,
    scan: ScanResult,
    repo_path: Path,
    project_name: str,
    completeness: float = 1.0,  # 0.0~1.0，支持部分图谱
) -> dict[str, Any]:
```

- `completeness < 1.0` 时，planner 在 prompt 中标注"图谱为部分分析结果，可能遗漏部分概念"
- `_merge_batches()` 接口支持接收 `existing_graph: KnowledgeGraph | None` 参数，v1 传 None，v2 可传上一次的图做增量合并
- `StaticGraph` 的构建本身是确定性的，可缓存到 `knowledge/static-graph.json`，仅在文件变更时重建

**v2 方向**（不在本次实施范围，仅设计接口）：
- batch 完成即写入 partial KG → plan_from_graph 在 60% batch 完成后可提前启动
- `chapter-outline.json` 支持 `draft: true` 标记，后续 batch 完成后 refine

### Decision 7: 骨架 YAML 不含 chapters 字段

`generate_skeleton_yaml()` 输出与当前 `generate_yaml()` 相同的头部（name, repo_path, language, book 等），但 `chapters:` 部分留空。这允许：
- `load_project_config()` 仍然可以成功加载（chapters 默认为空列表）
- step_analyze 能正常创建 knowledge_dir 和 knowledge-graph.json
- graph_plan 完成后再通过 `update_yaml_chapters()` 追加 chapters 块

### Decision 8: 前端进度展示复用现有 SSE + TerminalLoader

init 脚本已经通过 `--log-sink` 输出 JSONL 日志。新增的阶段会自然产出新的 log 事件，TerminalLoader 无需结构性改动即可展示。

阶段进度映射：
| Phase | progress range | phase tag |
|-------|---------------|-----------|
| Clone (remote only) | 0-5% | clone |
| Scan | 5-10% | scan |
| Static Graph (tree-sitter) | 10-15% | static-graph |
| Skeleton YAML | 15-18% | yaml |
| Analyze (discovery+batch+merge) | 18-65% | analyze |
| Graph Validation | 65-68% | validate |
| Graph-Plan (community + topo + LLM) | 68-90% | graph-plan |
| Write final YAML + outline | 90-100% | yaml |

## Risks / Trade-offs

**[风险] init 时间显著增加** → analyze 需要多轮 Claude API 调用（Global Discovery + Batch Analysis），可能从原来的 30-60s 增加到 3-8 分钟。
- 缓解：tree-sitter 静态基座减少 LLM 需要提取的信息量（预估 token 节省 40-60%），社区检测和拓扑排序为纯算法（< 1s）。前端 TerminalLoader 展示实时进度。
- v2 方向：增量构建 + 部分图谱提前规划，可将可感知延迟降到 60-90s。

**[风险] 临时 HarnessRunner 构造** → init 阶段需要构造一个 HarnessRunner 来调用 step_analyze，但 runner 的某些字段（如 control_file, error_ledger）在 init 阶段无意义。
- 缓解：只传必需参数（config, knowledge_dir），其余保持默认值。runner 不执行 `_acquire_lock()`，仅作为数据容器使用。

**[风险] analyze 失败时无法回退** → 如果 Claude CLI 异常或网络中断，图谱生成失败。
- 缓解：保留 `_generate_fallback_skeleton()` 作为最终兜底。如果 analyze 失败，退回"基于目录结构的浅层规划"并在日志中警告。tree-sitter 静态图仍可用于基础结构展示。

**[风险] tree-sitter 语言覆盖不全** → 某些小众语言可能没有 tree-sitter grammar。
- 缓解：`build_static_graph()` 对不支持的语言返回空结果，不阻塞流程。LLM 分析作为补充层仍会处理所有文件。

**[风险] 社区检测在小型 repo 上不稳定** → 节点数 < 10 时 Louvain 可能将所有节点归为一个社区。
- 缓解：设置阈值，semantic 节点 < 5 时跳过社区检测，全部归入单个 Part。

**[Trade-off] init 不再是"幂等"的** → analyze 会写入 knowledge-graph.json，chapter-outline.json 也会被覆盖。
- 缓解：检测 knowledge-graph.json 是否已存在，存在则跳过 analyze（与 runner.run 中的逻辑一致），除非传入 `--force`。

**[Trade-off] 新增 tree-sitter + networkx 依赖** → 增加安装包体积。
- 缓解：两者都是成熟 Python 库（MIT license），在数据科学/开发工具生态中广泛使用。tree-sitter 作为可选依赖，缺失时 graceful fallback。
