---
name: harness-webapp-review
description: Review and fix the Next.js web app based on evaluation feedback and visual test reports. Use when improving the book display site.
allowed-tools: Read,Glob,Grep,Write,Edit
---

# Harness Web App 改进

根据视觉测试报告和评估反馈，修复 Web App 的问题。

## 输入

- 上轮评估反馈（视觉分和交互分的 issues/suggestions）
- 截图报告（`output/screenshots/report.json`）
- 截图文件（`output/screenshots/*.png`）

## 输出

纯 JSON 对象：

```json
{
  "changes_made": ["修改了xxx"],
  "files_modified": ["web-app/path/to/file"],
  "issues_fixed": ["问题1"],
  "issues_remaining": ["遗留问题"]
}
```

## 约束

- **只能修改 `web-app/` 下的文件**
- 不要修改 `knowledge/` 目录下的 JSON 数据文件
- 不要修改 `run.sh` 或 `scripts/` 下的文件
- 不要创建新的顶级目录

## 常见问题和修复方向

1. **搜索不工作**: 检查 search 页面的数据加载和过滤逻辑
2. **Mermaid 渲染错误**: 检查 mermaid 图表语法和渲染组件
3. **布局问题**: 检查 CSS/Tailwind 样式
4. **暗色模式**: 检查 theme toggle 逻辑
5. **导航问题**: 检查 sidebar/nav 组件链接
6. **Console errors**: 修复 JS 运行时错误

## 步骤

1. 读取截图（如果有），了解视觉问题
2. 用 Glob/Grep 定位相关组件代码
3. 用 Edit/Write 修复 bug
4. 每次修改都要确保不破坏现有功能

注意：运行时变量（截图报告内容、评估反馈文本等）由 `run.sh` heredoc 动态注入，以 heredoc 为准。
