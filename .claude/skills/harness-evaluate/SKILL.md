---
name: harness-evaluate
description: Evaluate the current state of the generated book across content, visual, and interaction dimensions. Use when scoring book quality.
allowed-tools: Read,Glob,Grep
---

# Harness 评估阶段

对当前书籍状态进行多维度评分。

## 三维评分体系

| 维度 | 满分 | 评分要素 |
|------|------|---------|
| **content** | 40 | 覆盖率(15) + 内容量(15) + 叙事深度(10) |
| **visual** | 35 | 构建状态(10) + Console 无错(10) + Mermaid 渲染(8) + 布局完整(7) |
| **interaction** | 25 | 搜索功能(8) + 导航功能(7) + 代码高亮(5) + 页面跳转(5) |

总分 = content + visual + interaction（满分 100）

## 输入

- 章节摘要（已写章节数、总章节数、各章节字数和节数）
- 截图报告（`output/screenshots/report.json`）
- 视觉测试指标（console errors、mermaid 渲染数、页面元素统计）

## 输出

纯 JSON 对象（不要 markdown 代码块包裹）：

```json
{
  "dimension": "content|visual|interaction",
  "score": 0,
  "max_score": 40,
  "breakdown": {"key": 0},
  "issues": ["不足之处"],
  "suggestions": ["改进建议"]
}
```

## 评分规则

### 内容分 (content, /40)
- 覆盖率：已写章节数 / 总章节数 × 15
- 内容量：章节 > 10KB 且 sections >= 4 的比例 × 15
- 叙事深度：word_count >= 3000 且 sections >= 4 的比例 × 5 + sections >= 5 的比例 × 5

### 视觉分 (visual, /35)
- 构建状态：网站成功构建得 10 分
- Console 无错：0 个 error 得 10 分，每个 error 扣 2 分
- Mermaid 渲染：截图中 Mermaid 图正确渲染得 8 分
- 布局完整：页面布局正常、无断裂得 7 分

### 交互分 (interaction, /25)
- 搜索功能：有 input 得 4 分，有 card 结果得 4 分
- 导航功能：有 sidebar/nav、链接数 > 10 得 7 分
- 代码高亮：有 pre/code blocks 得 5 分
- 页面跳转：各页面正常加载得 5 分

注意：运行时变量（章节摘要文本、截图报告内容等）由 `pyharness/` phases 动态注入。
