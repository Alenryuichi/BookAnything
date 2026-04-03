/**
 * Playwright 视觉测试脚本
 * 用法: node scripts/visual-test.js <out-dir> <screenshot-dir>
 *
 * 启动静态服务器，截图关键页面，收集 console errors
 */
const { chromium } = require('playwright');
const { createServer } = require('http');
const { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } = require('fs');
const { join, extname } = require('path');

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.txt': 'text/plain', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

async function main() {
  const outDir = process.argv[2] || join(__dirname, '..', 'web-app', 'out');
  const screenshotDir = process.argv[3] || join(__dirname, '..', 'output', 'screenshots');

  if (!existsSync(outDir)) {
    console.error(`Build output not found: ${outDir}`);
    process.exit(1);
  }
  mkdirSync(screenshotDir, { recursive: true });

  // Simple static file server
  const server = createServer((req, res) => {
    const urlPath = req.url.split('?')[0];
    let filePath = join(outDir, urlPath);

    // If it's a directory, look for index.html inside
    try {
      const { statSync } = require('fs');
      if (statSync(filePath).isDirectory()) {
        filePath = join(filePath, 'index.html');
      }
    } catch {}

    // Try .html extension
    if (!existsSync(filePath)) {
      filePath = join(outDir, urlPath + '.html');
    }
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const mime = MIME[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(readFileSync(filePath));
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Server running at ${baseUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const results = {};

  // Console error categorization by component
  const categorizeError = (msg) => {
    if (/mermaid/i.test(msg)) return 'mermaid';
    if (/shiki|hljs|highlight|prism/i.test(msg)) return 'shiki';
    if (/search|fuse|lunr|filter/i.test(msg)) return 'search';
    return 'other';
  };

  // Core pages to test
  const pages = [
    { name: 'home', path: '/', desc: '首页 - 架构总览 + 模块列表' },
    { name: 'graph', path: '/graph', desc: '依赖关系图' },
    { name: 'search', path: '/search', desc: '搜索页面' },
    { name: 'module-tools-core', path: '/modules/tools-core', desc: '模块详情: Tool抽象层' },
    { name: 'module-tasks', path: '/modules/tasks', desc: '模块详情: 任务引擎' },
    { name: 'module-commands', path: '/modules/commands', desc: '模块详情: 命令系统' },
    { name: 'module-unanalyzed', path: '/modules/vim', desc: '未分析模块占位页' },
  ];

  // Auto-discover chapter pages from the build output
  const chaptersDir = join(outDir, 'chapters');
  if (existsSync(chaptersDir)) {
    try {
      const chapterFiles = readdirSync(chaptersDir).filter(f => f.endsWith('.html'));
      // Add up to 5 chapter pages for testing
      const chapterSample = chapterFiles.slice(0, 5);
      for (const file of chapterSample) {
        const slug = file.replace('.html', '');
        pages.push({
          name: `chapter-${slug}`,
          path: `/chapters/${slug}`,
          desc: `章节页: ${slug}`,
        });
      }
      console.log(`Discovered ${chapterFiles.length} chapter pages, testing ${chapterSample.length}`);
    } catch (err) {
      console.log(`Could not discover chapters: ${err.message}`);
    }
  }

  for (const { name, path: pagePath, desc } of pages) {
    const page = await context.newPage();
    const pageErrors = [];
    const categorizedErrors = { mermaid: [], shiki: [], search: [], other: [] };

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        pageErrors.push(text);
        categorizedErrors[categorizeError(text)].push(text);
      }
    });
    page.on('pageerror', err => {
      pageErrors.push(err.message);
      categorizedErrors[categorizeError(err.message)].push(err.message);
    });

    try {
      await page.goto(`${baseUrl}${pagePath}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);

      // Desktop screenshot
      await page.screenshot({
        path: join(screenshotDir, `${name}-desktop.png`),
        fullPage: true,
      });

      // Mobile screenshot
      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({
        path: join(screenshotDir, `${name}-mobile.png`),
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 900 });

      // Collect page metrics (unchanged from before)
      const metrics = await page.evaluate(() => ({
        title: document.title,
        h1Count: document.querySelectorAll('h1').length,
        h2Count: document.querySelectorAll('h2').length,
        cardCount: document.querySelectorAll('.card').length,
        linkCount: document.querySelectorAll('a').length,
        codeBlockCount: document.querySelectorAll('pre').length,
        mermaidCount: document.querySelectorAll('.mermaid-container svg, .mermaid svg').length,
        mermaidErrorCount: document.querySelectorAll('.mermaid-error, [id^="d-"] .error').length,
        navItemCount: document.querySelectorAll('.nav-item').length,
        bodyText: document.body.innerText.length,
        hasSearchInput: !!document.querySelector('input[type="text"], input[type="search"]'),
        hasSidebar: !!document.querySelector('.sidebar, nav[class*="sidebar"]'),
        hasFooter: !!document.querySelector('footer'),
        hasDarkModeToggle: !!document.querySelector('[data-theme-toggle], .theme-toggle, button[aria-label*="theme"]'),
      }));

      // Collect mermaid diagnostics
      const mermaidDiag = await page.evaluate(() => {
        const jsLoaded = typeof window.mermaid !== 'undefined';
        const containers = document.querySelectorAll('.mermaid, .mermaid-container');
        const containersFound = containers.length;
        let svgsRendered = 0;
        containers.forEach(c => { svgsRendered += c.querySelectorAll('svg').length; });
        const errorEls = document.querySelectorAll('.mermaid-error');
        const renderErrors = Array.from(errorEls).map(el => el.textContent.trim()).filter(Boolean);
        return { jsLoaded, containersFound, svgsRendered, renderErrors };
      });
      mermaidDiag.consoleErrors = categorizedErrors.mermaid;

      // Collect code block diagnostics
      const codeBlockDiag = await page.evaluate(() => {
        const preTagCount = document.querySelectorAll('pre').length;
        const codeTagCount = document.querySelectorAll('code').length;
        const highlighted = document.querySelectorAll(
          'pre[data-language], code[data-language], [class*="language-"], [class*="shiki"], [class*="hljs"]'
        );
        const shikiClassesFound = highlighted.length > 0;
        const highlightedBlockCount = highlighted.length;
        return { preTagCount, codeTagCount, shikiClassesFound, highlightedBlockCount };
      });

      // Collect search diagnostics (active interaction on search page only)
      let searchDiag = { inputFound: false, queryTyped: false, resultsAfterQuery: 0, cardCountAfterQuery: 0 };
      if (name === 'search') {
        const inputEl = await page.$('input[type="text"], input[type="search"], input[placeholder]');
        if (inputEl) {
          searchDiag.inputFound = true;
          try {
            // Determine test query: use first chapter title or fallback
            let testQuery = 'tool';
            const firstChapter = Object.keys(results).find(k => k.startsWith('chapter-'));
            if (firstChapter && results[firstChapter]?.metrics?.title) {
              const title = results[firstChapter].metrics.title;
              if (title && title.length > 2) testQuery = title.split(/[—\-:|]/)[0].trim().substring(0, 20);
            }
            await inputEl.fill(testQuery);
            searchDiag.queryTyped = true;
            await page.waitForTimeout(3000);
            const afterMetrics = await page.evaluate(() => ({
              cardCount: document.querySelectorAll('.card, [class*="result"], [class*="search-item"]').length,
              resultElements: document.querySelectorAll('[class*="result"], [class*="search-item"], .card').length,
            }));
            searchDiag.resultsAfterQuery = afterMetrics.resultElements;
            searchDiag.cardCountAfterQuery = afterMetrics.cardCount;
          } catch (e) {
            searchDiag.queryTyped = false;
          }
        }
      }

      const diagnostics = {
        mermaid: mermaidDiag,
        codeBlock: codeBlockDiag,
        search: searchDiag,
      };

      results[name] = {
        desc,
        path: pagePath,
        errors: pageErrors,
        categorizedErrors,
        metrics,
        diagnostics,
        screenshots: [`${name}-desktop.png`, `${name}-mobile.png`],
      };

      console.log(`✓ ${name}: ${pageErrors.length} errors, ${metrics.cardCount} cards, ${metrics.codeBlockCount} code blocks, ${metrics.mermaidCount} mermaid | diag: mermaid.svgs=${mermaidDiag.svgsRendered} code.pre=${codeBlockDiag.preTagCount} search.cards=${searchDiag.cardCountAfterQuery}`);
    } catch (err) {
      results[name] = {
        desc, path: pagePath, errors: [err.message], categorizedErrors: { mermaid: [], shiki: [], search: [], other: [err.message] },
        metrics: null, diagnostics: { mermaid: { jsLoaded: false, containersFound: 0, svgsRendered: 0, renderErrors: [], consoleErrors: [] }, codeBlock: { preTagCount: 0, codeTagCount: 0, shikiClassesFound: false, highlightedBlockCount: 0 }, search: { inputFound: false, queryTyped: false, resultsAfterQuery: 0, cardCountAfterQuery: 0 } },
        screenshots: [],
      };
      console.log(`✗ ${name}: ${err.message}`);
    }

    await page.close();
  }

  // Write report
  const report = {
    timestamp: new Date().toISOString(),
    baseUrl,
    pages: results,
    summary: {
      totalPages: pages.length,
      pagesWithErrors: Object.values(results).filter(r => r.errors.length > 0).length,
      totalErrors: Object.values(results).reduce((sum, r) => sum + r.errors.length, 0),
      totalMermaidErrors: Object.values(results).reduce((sum, r) => sum + (r.metrics?.mermaidErrorCount || 0), 0),
      totalMermaidRendered: Object.values(results).reduce((sum, r) => sum + (r.metrics?.mermaidCount || 0), 0),
      chapterPagesTested: Object.keys(results).filter(k => k.startsWith('chapter-')).length,
      screenshotFiles: Object.values(results).flatMap(r => r.screenshots),
    },
  };

  writeFileSync(join(screenshotDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nReport: ${join(screenshotDir, 'report.json')}`);
  console.log(`Screenshots: ${report.summary.screenshotFiles.length} files`);
  console.log(`Errors: ${report.summary.totalErrors} across ${report.summary.pagesWithErrors} pages`);
  console.log(`Mermaid: ${report.summary.totalMermaidRendered} rendered, ${report.summary.totalMermaidErrors} errors`);
  console.log(`Chapters tested: ${report.summary.chapterPagesTested}`);

  await browser.close();
  server.close();

  // Exit with error if there were page errors
  process.exit(report.summary.totalErrors > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
