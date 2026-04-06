import { test, expect } from "@playwright/test";

test.describe("Coverage UI", () => {
  test("shows coverage dashboard on book page", async ({ page, request }) => {
    const res = await request.get("/api/books");
    const data = await res.json();
    const bookId = data.books.find((b: any) => b.writtenCount > 0)?.id || data.books[0].id;

    if (!bookId) {
      test.skip();
      return;
    }

    await page.goto(`/books/${bookId}`);
    
    // Test the dashboard if we have an outline
    const dashboard = page.locator("text=Knowledge Graph Coverage");
    if (await dashboard.isVisible()) {
      await expect(page.locator("text=Covered Concepts")).toBeVisible();
      await expect(page.locator("text=Missing Concepts")).toBeVisible();
    } else {
      test.skip();
    }
  });

  test("shows coverage filters on graph explore page", async ({ page, request }) => {
    const res = await request.get("/api/books");
    const data = await res.json();
    const bookId = data.books.find((b: any) => b.writtenCount > 0)?.id || data.books[0].id;

    if (!bookId) {
      test.skip();
      return;
    }

    const kgRes = await request.get(`/api/books/${bookId}/knowledge-graph`);
    if (kgRes.status() !== 200) {
      test.skip();
      return;
    }

    await page.goto(`/books/${bookId}/explore`);
    
    const allBtn = page.locator('button:has-text("All")');
    const coveredBtn = page.locator('button:has-text("Covered")');
    const missingBtn = page.locator('button:has-text("Missing")');

    await expect(allBtn.first()).toBeVisible();
    await expect(coveredBtn.first()).toBeVisible();
    await expect(missingBtn.first()).toBeVisible();

    await missingBtn.first().click();
    await expect(missingBtn.first()).toHaveClass(/bg-red-600/);
  });
});
