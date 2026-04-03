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

  const errors = [];
  const results = {};

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

    page.on('console', msg => {
      if (msg.type() === 'error') pageErrors.push(msg.text());
    });
    page.on('pageerror', err => pageErrors.push(err.message));

    try {
      await page.goto(`${baseUrl}${pagePath}`, { waitUntil: 'networkidle', timeout: 15000 });
      // Wait a bit for Mermaid/D3 to render
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

      // Collect page metrics
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

      results[name] = {
        desc,
        path: pagePath,
        errors: pageErrors,
        metrics,
        screenshots: [`${name}-desktop.png`, `${name}-mobile.png`],
      };

      console.log(`✓ ${name}: ${pageErrors.length} errors, ${metrics.cardCount} cards, ${metrics.codeBlockCount} code blocks, ${metrics.mermaidCount} mermaid`);
    } catch (err) {
      results[name] = { desc, path: pagePath, errors: [err.message], metrics: null, screenshots: [] };
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
