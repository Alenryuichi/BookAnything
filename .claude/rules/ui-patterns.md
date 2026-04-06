---
description: 前端可复用 UI 组件模式和 SSE 实时日志流对接约定
globs: ["web-app/components/**", "web-app/app/**"]
---

# UI 组件模式

## TerminalLogViewer

实时日志流的标准展示组件，用于任何需要显示后台进程输出的页面。

### 使用场景

| 页面 | 组件位置 | 日志来源 |
|------|----------|----------|
| Generation Dashboard | `components/GenerationDashboard.tsx` | `rawLogs` via SSE |
| Knowledge Graph Analyze | `components/KnowledgeGraph/AnalyzeProgress.tsx` | `rawLogs` via SSE |

### 样式规范

- 深色终端背景 `bg-[#0a0a0a]`，标题栏 `bg-[#1a1a1a]`
- macOS 窗口三点按钮（红/黄/绿）
- 字体 `font-mono text-[11px] leading-relaxed`
- 固定高度滚动区域，自动滚到底部
- ANSI 转义码必须过滤：`msg.replace(/\x1b\[[0-9;]*m/g, "")`

### 日志着色

| level | 颜色 |
|-------|------|
| `ERROR` | `text-red-400` / `text-red-300` |
| `HEAD` | `text-blue-400` / `text-blue-300 font-bold` |
| `OK` | `text-green-400` |
| 其他 | `text-purple-400` / `text-gray-300` |

### 日志条目格式

每条日志显示三列：`[timestamp] [level] [message]`，timestamp 宽度 `w-16`，level 宽度 `w-12`。

## SSE 实时日志流对接模式

所有需要实时进度的功能统一使用以下管道：

```
pyharness (log_event) → --log-sink JSONL → jobManager 读取 → /api/jobs/{jobId}/stream SSE → 前端 EventSource
```

### 前端对接步骤

1. **启动 job**: `POST /api/books/{bookId}/analyze` (或其他 job 触发 API) → 拿到 `jobId`
2. **检测活跃 job**: `GET /api/books/{bookId}/active-job` → 如果有活跃 job 直接连接
3. **连接 SSE**: `new EventSource(/api/jobs/{jobId}/stream)`
4. **监听事件**: `log` 事件包含日志条目，`done` / `error` 为终端事件
5. **完成判定**: 必须收到业务级完成事件（如 `analyze_complete`）才算成功；仅收到 `done` 但无业务完成事件应视为失败

### EventSource 健壮性

- 连接断开时自动重连，最多 3 次，间隔递增（2s / 4s / 6s）
- 超过重连次数后显示 "Connection lost" + 手动刷新按钮
- 组件卸载时 `esRef.current?.close()` 清理连接

## 进度视图模式

当页面需要展示多阶段后台任务进度时，采用 **步骤时间线 + 进度条 + Terminal** 三层结构：

1. **步骤时间线**: 垂直排列，每步有 pending/active/complete 三态图标（Circle / Spinner / CheckCircle）
2. **加权进度条**: 按各阶段实际耗时比例分配权重，而非均分
3. **Terminal 日志**: 底部 TerminalLogViewer 展示原始输出，便于排查问题
