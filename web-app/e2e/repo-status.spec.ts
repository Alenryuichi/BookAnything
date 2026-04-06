import { test, expect } from "@playwright/test";

test.describe("API - Repo Status", () => {
  test("GET /api/books/{bookId}/repo-status returns status JSON", async ({ request }) => {
    const idx = await (await request.get("/api/books")).json();
    if (!idx.books || idx.books.length === 0) {
      test.skip();
      return;
    }
    const bookId = idx.books[0].id;
    const res = await request.get(`/api/books/${bookId}/repo-status`);
    expect([200, 404]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      expect(typeof body.exists).toBe("boolean");
      expect(typeof body.repoPath).toBe("string");
      expect(body.repoPath.length).toBeGreaterThan(0);
      expect(typeof body.canReclone).toBe("boolean");
    }
  });

  test("GET /api/books/{bookId}/repo-status returns 404 for unknown book", async ({ request }) => {
    const res = await request.get("/api/books/nonexistent-book-xyz/repo-status");
    expect(res.status()).toBe(404);
  });

  test("POST /api/books/{bookId}/reclone rejects when no remote URL", async ({ request }) => {
    const idx = await (await request.get("/api/books")).json();
    if (!idx.books || idx.books.length === 0) {
      test.skip();
      return;
    }
    const bookId = idx.books[0].id;

    const statusRes = await request.get(`/api/books/${bookId}/repo-status`);
    if (statusRes.status() !== 200) {
      test.skip();
      return;
    }
    const status = await statusRes.json();
    if (status.remoteUrl) {
      test.skip();
      return;
    }

    const res = await request.post(`/api/books/${bookId}/reclone`);
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("remote_url");
  });
});

test.describe("Page - Explore with missing repo", () => {
  test("explore page shows RepoMissing when repository does not exist", async ({ page, request }) => {
    const idx = await (await request.get("/api/books")).json();
    if (!idx.books || idx.books.length === 0) {
      test.skip();
      return;
    }

    let targetBookId: string | null = null;
    for (const book of idx.books) {
      const statusRes = await request.get(`/api/books/${book.id}/repo-status`);
      if (statusRes.status() === 200) {
        const status = await statusRes.json();
        if (!status.exists) {
          targetBookId = book.id;
          break;
        }
      }
    }

    if (!targetBookId) {
      test.skip();
      return;
    }

    await page.goto(`/books/${targetBookId}/explore`);
    await expect(page.getByText("Connect Repository")).toBeVisible({ timeout: 15000 });
    await expect(page.getByPlaceholder("https://github.com/")).toBeVisible();
  });
});
