---
alwaysApply: true
description: 可写目录白名单与禁写路径
---

# 路径边界

## 允许写入的目录

仅以下目录允许文件创建和修改：

- `knowledge/` — 章节 JSON 和模块分析数据
- `web-app/` — Next.js 前端应用
- `output/` — 日志、截图、构建产物
- `openspec/` — OpenSpec 变更管理
- `pyharness/` — Python 编排引擎
- `tests/` — 测试代码（但 `tests/e2e/fixture-repo/` 尽量不改）

## 根文件（允许但需谨慎）

以下根文件允许修改，但属于核心配置，修改前应确认意图：
`CLAUDE.md`、`goals.yaml`、`state.json`、`requirements.txt`、`pyproject.toml`

## 禁止写入

- 目标源码仓库（`repo_path` 指向的路径）
- `projects/*.yaml`（章节配置，需人工审核后修改）

## 读取不受限

所有路径均可读取，包括目标源码仓库。
