import { test, expect } from "@playwright/test";

test.describe("API - Book Index", () => {
  test("GET /api/books returns book list", async ({ request }) => {
    const res = await request.get("/api/books");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.books).toBeInstanceOf(Array);
    expect(body.books.length).toBeGreaterThan(0);
    const book = body.books[0];
    expect(book.id).toBeTruthy();
    expect(book.name).toBeTruthy();
    expect(book.chapterCount).toBeGreaterThan(0);
  });

  test("GET /api/books?refresh=true works", async ({ request }) => {
    const res = await request.get("/api/books?refresh=true");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.books.length).toBeGreaterThan(0);
  });
});

test.describe("API - Chapters", () => {
  test("GET chapters list for valid book", async ({ request }) => {
    const idx = await (await request.get("/api/books")).json();
    const bookId = idx.books[0].id;
    const res = await request.get(`/api/books/${bookId}/chapters`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.chapters).toBeInstanceOf(Array);
    expect(body.chapters.length).toBeGreaterThan(0);
    expect(body.chapters[0].chapter_id).toBeTruthy();
    expect(body.chapters[0].title).toBeTruthy();
  });

  test("GET single chapter returns full content", async ({ request }) => {
    const idx = await (await request.get("/api/books")).json();
    const bookId = idx.books[0].id;
    const chs = await (await request.get(`/api/books/${bookId}/chapters`)).json();
    const chId = chs.chapters[0].chapter_id;
    const res = await request.get(`/api/books/${bookId}/chapters/${chId}`);
    expect(res.status()).toBe(200);
    const ch = await res.json();
    expect(ch.title).toBeTruthy();
    expect(ch.sections.length).toBeGreaterThan(0);
    expect(ch.word_count).toBeGreaterThan(0);
  });

  test("GET nonexistent chapter returns 404", async ({ request }) => {
    const idx = await (await request.get("/api/books")).json();
    const bookId = idx.books[0].id;
    const res = await request.get(`/api/books/${bookId}/chapters/ch99-nonexistent`);
    expect(res.status()).toBe(404);
  });
});

test.describe("Page - Bookshelf", () => {
  test("/ redirects to /books", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/books**");
    expect(page.url()).toContain("/books");
  });

  test("/books shows book cards", async ({ page }) => {
    await page.goto("/books");
    await expect(page.getByText("BookAnything").first()).toBeVisible();
    await expect(page.locator("a[href^='/books/']").first()).toBeVisible();
  });

  test("clicking book navigates to TOC", async ({ page }) => {
    await page.goto("/books");
    await page.locator("a[href^='/books/']").first().click();
    await page.waitForURL("**/books/**");
    expect(page.url()).toMatch(/\/books\/[a-z-]+/);
  });
});

test.describe("Page - Book TOC", () => {
  test("shows chapter list with links", async ({ page, request }) => {
    const idx = await (await request.get("/api/books")).json();
    const bookId = idx.books[0].id;
    await page.goto(`/books/${bookId}`);
    const chapterLinks = page.locator(`a[href*="/books/${bookId}/chapters/"]`);
    await expect(chapterLinks.first()).toBeVisible();
  });
});

test.describe("Page - Chapter Reader", () => {
  test("renders chapter sections", async ({ page, request }) => {
    const idx = await (await request.get("/api/books")).json();
    const bookId = idx.books[0].id;
    const chs = await (await request.get(`/api/books/${bookId}/chapters`)).json();
    const chId = chs.chapters[0].chapter_id;
    await page.goto(`/books/${bookId}/chapters/${chId}`);
    // Use article > h1 to target just the chapter title, not the header
    await expect(page.locator("article h1, main h1").first()).toBeVisible();
    await expect(page.locator("h2").first()).toBeVisible();
  });
});

test.describe("Navigation", () => {
  test("sidebar visible with nav items", async ({ page, request }) => {
    const idx = await (await request.get("/api/books")).json();
    const bookId = idx.books[0].id;
    await page.goto(`/books/${bookId}`);
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".sidebar a[href^='/books/']").first()).toBeVisible();
  });

  test("sidebar links scoped to current book", async ({ page, request }) => {
    const idx = await (await request.get("/api/books")).json();
    const bookId = idx.books[0].id;
    await page.goto(`/books/${bookId}`);
    const href = await page.locator(".sidebar a[href^='/books/']").first().getAttribute("href");
    expect(href).toContain(`/books/${bookId}`);
  });
});
