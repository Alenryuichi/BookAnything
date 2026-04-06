## Why

Knowledge Graph 的 `analyze` 阶段通过 `jobManager.spawn()` 异步执行，后端已经埋好了完整的 SSE 事件（`analyze_start` → `analyze_scan_complete` → `analyze_batch_*` → `analyze_merge_complete` → `analyze_tours_complete` → `analyze_complete`），但前端 `EmptyState` 组件只做了简单的文件轮询，用户看到的是一个没有进度的"Analyzing codebase..."死循环。刷新页面或离开再回来后，进度状态完全丢失。

## What Changes

- **重写 `EmptyState` 组件**：从文件轮询改为 SSE 实时进度，展示 analyze 阶段的每一步状态和进度条
- **进入页面时检测活跃 job**：进入 `/explore` 时，如果图谱不存在，检查 `GET /api/books/{bookId}/active-job` 是否有正在运行的 analyze job，有则直接进入进度视图
- **完成后自动过渡**：收到 `analyze_complete` 事件后，自动重新加载图谱数据并渲染 React Flow，无需 `window.location.reload()`
- **错误与超时处理**：analyze 失败时显示错误详情和重试按钮，而非静默超时

## Capabilities

### New Capabilities
- `analyze-progress-view`: 实时展示 analyze 阶段的步骤进度（扫描 → 批量分析 → 合并 → Tour 生成），接入现有 SSE 日志流
- `analyze-job-detection`: 进入 explore 页面时自动检测正在运行的 analyze job，恢复进度视图

### Modified Capabilities

## Impact

- `web-app/components/KnowledgeGraph/KnowledgeGraphPage.tsx` — 重写 `EmptyState` 组件
- `web-app/components/KnowledgeGraph/hooks/useKnowledgeGraph.ts` — 新增 active job 检测逻辑
- 无后端改动（SSE 事件和 API 已就位）
- 无新依赖
