## Context

Knowledge Graph 的 `analyze` 阶段由 `pyharness/phases/analyze.py` 实现，已经通过 `log_event()` 发射了完整的进度事件序列：

```
analyze_start → analyze_scan_complete → analyze_batches_created →
  (analyze_batch_start / analyze_batch_complete) × N →
analyze_merge_complete → analyze_tours_complete → analyze_complete
```

这些事件通过 `--log-sink` JSONL 文件被 `jobManager` 读取，并通过 `/api/jobs/{jobId}/stream` SSE 端点推送给前端。

然而，当前 `EmptyState` 组件（`KnowledgeGraphPage.tsx:18-98`）仅使用 `setInterval` 每 3 秒轮询 `knowledge-graph.json` 是否存在，用户在整个分析过程中只看到一个静态的 "Analyzing codebase..." 文字和旋转图标。此外：
- 刷新页面后进度状态丢失（不检测活跃 job）
- 分析失败时 5 分钟后超时，无具体错误信息
- 分析完成后使用 `window.location.reload()` 全页刷新

现有后端基础设施已完备：
- `POST /api/books/{bookId}/analyze` — 启动分析 job，返回 `{ jobId }`
- `GET /api/books/{bookId}/active-job` — 检测活跃 job，返回 `{ jobId, state, progress }`
- `GET /api/jobs/{jobId}/stream` — SSE 流，推送 `log` 事件（含 `event` 字段如 `analyze_batch_complete`）

## Goals / Non-Goals

**Goals:**
- 用户在 `/explore` 页面看到 analyze 阶段的实时步骤进度（5 个阶段 + 批次进度条）
- 刷新页面或从其他页面回来时，自动检测活跃 analyze job 并恢复进度视图
- 分析完成后无缝过渡到图谱视图（无全页刷新）
- 分析失败时显示具体错误信息和重试按钮

**Non-Goals:**
- 不修改后端 pyharness 代码（已有足够的 SSE 事件）
- 不修改 `jobManager` 或 SSE 流路由
- 不支持取消分析操作（留给后续迭代）
- 不修改 `useKnowledgeGraph` hook 的核心逻辑

## Decisions

### 1. SSE 事件消费方式：直接 EventSource

使用浏览器原生 `EventSource` API 连接 `/api/jobs/{jobId}/stream`。

**Why**: 
- 已有标准 SSE 端点，无需引入 WebSocket 或第三方库
- EventSource 自带自动重连机制
- 与 Dashboard 页面使用的模式一致

**Alternative**: 短轮询 active-job API — 延迟高、粒度粗，无法展示批次级进度

### 2. 进度模型：5 阶段 + 批次进度条

将 analyze 过程映射为 5 个阶段的线性进度：

| 阶段 | 对应事件 | 进度权重 |
|-------|----------|----------|
| Scanning files | `analyze_start` → `analyze_scan_complete` | 10% |
| Analyzing code | `analyze_batches_created` → 所有 `analyze_batch_complete` | 60% |
| Merging results | 最后一个 batch complete → `analyze_merge_complete` | 15% |
| Generating tours | `analyze_merge_complete` → `analyze_tours_complete` | 10% |
| Finalizing | `analyze_tours_complete` → `analyze_complete` | 5% |

"Analyzing code" 阶段内部：根据 `analyze_batches_created.total_batches` 和已完成的 `analyze_batch_complete` 数量计算细粒度进度。

**Why**: 权重分配反映实际耗时（Claude 批量分析占大头），给用户准确的时间预期。

**Alternative**: 均匀分配权重 — 会导致扫描阶段飞速完成而分析阶段停滞不前。

### 3. 页面加载时 Job 检测流程

```
/explore 加载
  ├─ fetch knowledge-graph.json
  │   ├─ 200 → 直接渲染图谱
  │   └─ 404 → fetch active-job
  │       ├─ 200 → 拿到 jobId，进入进度视图，连接 SSE
  │       └─ 404 → 显示 EmptyState（Generate 按钮）
  └─ 用户点击 Generate
      └─ POST analyze → 拿到 jobId → 进入进度视图，连接 SSE
```

**Why**: 两次串行请求（kg → active-job）比并行更简单且避免竞态。如果 kg 存在就无需检查 job。

### 4. 完成后自动过渡：重新 fetch + setState

收到 `analyze_complete` 事件后：
1. 短暂显示 "Analysis complete!" 过渡状态（1s）
2. 调用 `useKnowledgeGraph` 暴露的 `refetch()` 方法重新加载图谱数据
3. 数据到位后自动渲染 React Flow

**Why**: 避免 `window.location.reload()` 的白屏闪烁。`refetch()` 是 hook 内部 state 更新，React 直接过渡。

**Alternative**: `window.location.reload()` — 简单但用户体验差（白屏闪烁）。

### 5. 新组件拆分

```
KnowledgeGraphPage.tsx
  ├─ AnalyzeProgress.tsx (新)   — 进度视图（步骤列表 + 进度条 + 状态文字）
  │   └─ useAnalyzeProgress.ts (新 hook) — EventSource 管理 + 事件解析 + 进度计算
  └─ EmptyState (重写)           — 简化为纯 UI，点击后交由 AnalyzeProgress 接管
```

**Why**: 职责分离。`EmptyState` 只负责展示空状态和 Generate 按钮，进度逻辑全部在 `AnalyzeProgress` 中。

## Risks / Trade-offs

**[Risk] SSE 连接中断** → EventSource 自动重连 + 通过 `Last-Event-ID` 恢复。如果重连也失败（如服务重启），显示 "Connection lost" 并提供手动刷新按钮。

**[Risk] analyze job 在 jobManager 重启后丢失** → `active-job` API 返回 404，用户看到 EmptyState 的 Generate 按钮，可以重新触发。这是可接受的降级。

**[Risk] 事件顺序异常（如跳过 `analyze_batches_created`）** → 进度计算采用防御性编程，未收到的阶段视为已完成，批次数默认为 1。

**[Trade-off] 不支持取消** → 当前 analyze 通常在 2-5 分钟内完成，取消需求不强。如果后续需要，可以复用 Dashboard 的 cancel 按钮逻辑。
