## ADDED Requirements

### Requirement: Bookshelf page at /books
系统 MUST 提供 `/books` 书架页面，展示所有可用书籍的卡片列表。

#### Scenario: Multiple books displayed
- **WHEN** 用户访问 `/books`，`knowledge/` 下有 2 本书
- **THEN** 页面 MUST 展示 2 张书籍卡片，每张包含书名、描述、进度条（writtenCount/chapterCount）、语言标签

#### Scenario: Empty bookshelf
- **WHEN** 用户访问 `/books`，没有任何书籍
- **THEN** 页面 MUST 显示空状态提示（如 "还没有书，开始创建第一本吧"）

### Requirement: Book card click navigation
书籍卡片点击后 MUST 导航到 `/books/[bookId]` 单书首页。

#### Scenario: Click book card
- **WHEN** 用户点击 "深入理解 Claude Code" 卡片
- **THEN** 浏览器 MUST 导航到 `/books/claude-code`

### Requirement: Single book page at /books/[bookId]
`/books/[bookId]` 页面 MUST 展示该书的目录（与现有首页类似），包含 Part 分组、章节列表、进度条、统计数据。

#### Scenario: Book page renders
- **WHEN** 用户访问 `/books/claude-code`
- **THEN** 页面 MUST 显示书名、副标题、章节目录（含 Part 分组和颜色标记）、已写/总章节进度条

### Requirement: Chapter reader at /books/[bookId]/chapters/[id]
章节阅读页 MUST 保持现有的所有阅读功能：Mermaid 图渲染、代码高亮、Callout、Table、暗色模式、阅读进度条。

#### Scenario: Chapter renders with all features
- **WHEN** 用户访问 `/books/claude-code/chapters/ch01-what-is-claude-code`
- **THEN** 页面 MUST 渲染 opening_hook、sections（含 code/diagram/callout/table）、key_takeaways、further_thinking

### Requirement: Root redirect
访问 `/` 根路径 MUST 重定向到 `/books`。

#### Scenario: Root path redirect
- **WHEN** 用户访问 `/`
- **THEN** 浏览器 MUST 重定向（302）到 `/books`

### Requirement: Legacy URL redirect
访问旧的 `/chapters/[id]` 路径 MUST 重定向到默认书的对应章节。

#### Scenario: Old chapter URL redirect
- **WHEN** 用户访问 `/chapters/ch01-what-is-claude-code`
- **THEN** 浏览器 MUST 重定向到 `/books/{default-book}/chapters/ch01-what-is-claude-code`
