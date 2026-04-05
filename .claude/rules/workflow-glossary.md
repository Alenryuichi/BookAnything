---
alwaysApply: true
description: 核心术语定义（iteration/score/threshold）和 7 阶段流程说明
---

# 工作流术语与流程

## 核心术语

| 术语 | 定义 |
|------|------|
| **iteration** | 一次完整的 Plan → Write → ... → Eval 循环 |
| **chapter** | 一个章节 JSON 文件，存储在 `knowledge/{项目名}/chapters/` |
| **score** | 多维评分总和（满分 100），由 content + visual + interaction 构成 |
| **content score** | 内容质量分（满分 40）：覆盖率 + 内容量 + 叙事深度 |
| **visual score** | 视觉质量分（满分 35）：构建状态 + Console 无错 + Mermaid 渲染 + 布局完整 |
| **interaction score** | 交互功能分（满分 25）：搜索 + 导航 + 代码高亮 + 页面跳转 |
| **threshold** | 达标分数（默认 85），达到后 harness 停止迭代 |
| **knowledge project** | 由 `projects/*.yaml` 中 `name` 字段定义的项目名，决定 knowledge 子目录 |
| **state.json** | 持久化状态文件，记录 iteration、score、phase、history |

## 7 阶段流程

1. **Plan** — 根据当前状态和上轮评估，决定本轮写哪些章节
2. **Write** — 并行生成 2-3 个章节 JSON
3. **Improve** — 根据评估反馈修复 web-app（条件执行）
4. **Review** — 对 web-app 改动做代码审查（风险高可回滚）
5. **Build** — `next build` 构建静态站点
6. **Test** — Playwright 截图 + 页面指标采集
7. **Eval** — 内容/视觉/交互三路并行评分，合并为总分
