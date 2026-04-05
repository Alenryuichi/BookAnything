/**
 * Playwright 视觉测试脚本 (standalone/dev 模式)
 * 用法: node scripts/visual-test.js [screenshot-dir]
 *
 * 启动 next dev server，截图关键页面，收集 console errors
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const { existsSync, mkdirSync, writeFileSync, readFileSync } = require('fs');
const { join } = require('path');

const HARNESS_DIR = join(__dirname, '..');
const WEBAPP_DIR = join(HARNESS_DIR, 'web-app');
const INDEX_FILE = join(HARNESS_DIR, 'knowledge', 'index.json');

function loadBookIds() {
  if (!existsSync(INDEX_FILE)) return [];
  try {
    const data = JSON.parse(readFileSync(INDEX_FILE, 'utf-8'));
    return (data.books || []).map(b => b.id);
  } catch { return []; }
}

async function waitForServer(url, maxWait = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  const screenshotDir = process.argv[2] || join(HARNESS_DIR, 'output', 'screenshots');
  mkdirSync(screenshotDir, { recursive: true });

  // Start next dev server
  console.log('Starting Next.js dev server...');
  const server = spawn('npm', ['run', 'dev'], {
    cwd: WEBAPP_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '3456' },
  });

  let serverOutput = '';
  server.stdout.on('data', d => { serverOutput += d.toString(); });
  server.stderr.on('data', d => { serverOutput += d.toString(); });

  const baseUrl = 'http://localhost:3456';
  const ready = await waitForServer(`${baseUrl}/api/books`);
  if (!ready) {
    console.error('Server failed to start within 30s');
    console.error(serverOutput);
    server.kill();
    process.exit(1);
  }
  console.log('Server ready at', baseUrl);

  const bookIds = loadBookIds();
  const firstBook = bookIds[0] || 'claude-code';

  // Pages to test
  const pages = [
    { name: 'bookshelf', path: '/books', desc: '书架首页' },
    { name: 'book-toc', path: `/books/${firstBook}`, desc: '单书目录' },


  ];

  // Add first 3 chapters from each book
  for (const bookId of bookIds.slice(0, 2)) {
    try {
      const res = await fetch(`${baseUrl}/api/books/${bookId}/chapters`);
      const data = await res.json();
      for (const ch of (data.chapters || []).slice(0, 3)) {
        pages.push({
          name: `${bookId}-${ch.chapter_id}`,
          path: `/books/${bookId}/chapters/${ch.chapter_id}`,
          desc: `${bookId}: ${ch.title}`,
        });
      }
    } catch {}
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const results = {};

  for (const { name, path: pagePath, desc } of pages) {
    const page = await context.newPage();
    const pageErrors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') pageErrors.push(msg.text());
    });
    page.on('pageerror', err => pageErrors.push(err.message));

    try {
      await page.goto(`${baseUrl}${pagePath}`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: join(screenshotDir, `${name}-desktop.png`),
        fullPage: true,
      });

      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({
        path: join(screenshotDir, `${name}-mobile.png`),
        fullPage: true,
      });

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
      }));

      results[name] = { desc, path: pagePath, errors: pageErrors, metrics, screenshots: [`${name}-desktop.png`, `${name}-mobile.png`] };
      const status = pageErrors.length === 0 ? '✓' : '✗';
      console.log(`${status} ${name}: ${pageErrors.length} errors, ${metrics.cardCount} cards, ${metrics.codeBlockCount} code, ${metrics.mermaidCount} mermaid`);
    } catch (err) {
      results[name] = { desc, path: pagePath, errors: [err.message], metrics: null, screenshots: [] };
      console.log(`✗ ${name}: ${err.message}`);
    }
    await page.close();
  }

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl,
    pages: results,
    summary: {
      totalPages: pages.length,
      pagesWithErrors: Object.values(results).filter(r => r.errors.length > 0).length,
      totalErrors: Object.values(results).reduce((sum, r) => sum + r.errors.length, 0),
      totalMermaidRendered: Object.values(results).reduce((sum, r) => sum + (r.metrics?.mermaidCount || 0), 0),
      totalMermaidErrors: Object.values(results).reduce((sum, r) => sum + (r.metrics?.mermaidErrorCount || 0), 0),
      screenshotFiles: Object.values(results).flatMap(r => r.screenshots),
    },
  };

  writeFileSync(join(screenshotDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nReport: ${join(screenshotDir, 'report.json')}`);
  console.log(`Pages: ${report.summary.totalPages} tested, ${report.summary.pagesWithErrors} with errors`);
  console.log(`Errors: ${report.summary.totalErrors} total`);

  await browser.close();
  server.kill();
  process.exit(report.summary.totalErrors > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
