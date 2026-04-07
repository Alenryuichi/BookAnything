# BookAnything

把任意源码仓库「讲成一本由浅入深的技术书」，并用 **Next.js 交互站点** 阅读。  
编排引擎是 **pyharness**（Plan → Write → Eval 循环），章节与图谱数据落在 `knowledge/`。

## 页面截图（本地开发）

以下截图为在同一机器上运行 `web-app` 开发服务时，用 Playwright 连接本机 Chrome 对 **http://127.0.0.1:3000** 采集得到（暗色主题）。

### 书架 `/books`

![书架：全部书目](web-app/public/readme/screenshot-books.png)

### 阅读页 `/books/claude-code`（示例书目）

![章节阅读示例](web-app/public/readme/screenshot-chapter.png)

若你要更新配图：先 `cd web-app && npm run dev`，再执行：

```bash
npx playwright screenshot --channel=chrome --color-scheme=dark --viewport-size=1440,900 --wait-for-timeout=2500 \
  http://127.0.0.1:3000/books public/readme/screenshot-books.png
```

阅读页同理，改 URL 与输出文件名即可。

## 快速开始

### 阅读站（Web）

```bash
cd web-app
npm install
npm run dev
```

浏览器打开 <http://localhost:3000> → 默认会进入书架。站点从仓库根目录下的 `knowledge/` 与 `projects/` 读取数据。

### 编排 CLI（Python）

```bash
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

pyharness run --project projects/claude-code.yaml
pyharness init /path/to/target-repo
pyharness write --project projects/your-book.yaml --chapter ch01-overview
pyharness analyze --project projects/your-book.yaml
```

常用参数见 `pyharness/__main__.py`（如 `--max-hours`、`--threshold`、`--quick` 等）。

## 仓库结构（概要）

| 路径 | 作用 |
|------|------|
| `pyharness/` | Python 编排：跑循环、初始化项目配置、单章写作、源码分析 |
| `web-app/` | Next.js 站点：目录、搜索、仪表盘、知识图谱等 |
| `projects/*.yaml` | 每本书的目标仓库、章节列表与元数据 |
| `knowledge/<书名>/` | 生成的章节 JSON、索引、图谱等 |
| `.claude/` | 写书与评测用到的规则与技能 |

## 许可证

以仓库内 LICENSE 文件为准（若尚未添加，请先补充）。
