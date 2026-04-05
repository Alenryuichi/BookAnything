import { test, expect } from "@playwright/test";
import path from "path";

test.describe("Book Creation Wizard", () => {
  // Use a timeout of 120s for the entire test as pyharness init takes some time
  test.setTimeout(120000);

  test("should create a new book and allow rewrite", async ({ page }) => {
    test.setTimeout(120000); // 2 mins timeout for this specific test

    // 1. Go to books wizard
    const port = process.env.PORT || 3456;
    await page.goto(`http://localhost:${port}/books/new`);
    await expect(page.locator("h1")).toContainText("Create a New Book");

    // 2. Fill repo path
    const harnessRoot = path.resolve(__dirname, "../../");
    const fixtureRepoPath = path.join(harnessRoot, "tests/e2e/fixture-repo");
    await page.fill('input[id="repoPath"]', fixtureRepoPath);

    // 3. Submit
    await page.click('button[type="submit"]');

    // 4. Wait for redirect to /books
    await page.waitForURL(/.*\/books$/, { timeout: 90000 });

    // 5. Verify book card exists
    const bookLink = page.locator('a[href^="/books/"]', { hasText: /fixture-repo/i }).first();
    await expect(bookLink).toBeVisible();

    // 6. Click into book
    await bookLink.click();
    await page.waitForURL(/\/books\/[^/]+/);

    // 7. Click the first chapter in the sidebar
    const firstChapterLink = page.locator('.sidebar a[href*="/chapters/"]').first();
    await expect(firstChapterLink).toBeVisible();
    await firstChapterLink.click();

    // 8. Verify Rewrite button
    const rewriteBtn = page.locator('button', { hasText: /Rewrite|Rewriting/i }).first();
    await expect(rewriteBtn).toBeVisible();

    // Accept confirm dialog
    page.once('dialog', dialog => dialog.accept());

    // Click Rewrite
    await rewriteBtn.click();
    await expect(rewriteBtn).toContainText("Rewriting...");
    
    // Wait for finish
    await expect(rewriteBtn).toHaveText("↻ Rewrite", { timeout: 60000 });
  });
});
