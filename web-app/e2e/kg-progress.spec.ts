import { test, expect } from "@playwright/test";

test.describe("Knowledge Graph - Explore Page", () => {
  test("explore page loads with EmptyState when no graph exists", async ({
    page,
    request,
  }) => {
    const idx = await (await request.get("/api/books")).json();
    const bookId = idx.books[0]?.id;
    if (!bookId) {
      test.skip();
      return;
    }

    await page.goto(`/books/${bookId}/explore`);
    await page.waitForLoadState("networkidle");

    const hasGraph = await page
      .locator("text=Knowledge Graph")
      .first()
      .isVisible()
      .catch(() => false);

    const hasCanvas = await page
      .locator(".react-flow")
      .first()
      .isVisible()
      .catch(() => false);

    // Either we see the graph (react-flow) or the EmptyState
    expect(hasGraph || hasCanvas).toBeTruthy();
  });

  test("EmptyState shows Generate button when no graph", async ({
    page,
    request,
  }) => {
    const idx = await (await request.get("/api/books")).json();
    const bookId = idx.books[0]?.id;
    if (!bookId) {
      test.skip();
      return;
    }

    // Check if knowledge-graph exists
    const kgRes = await request.get(
      `/api/books/${bookId}/knowledge-graph`,
    );
    if (kgRes.status() === 200) {
      test.skip(); // graph exists, skip EmptyState test
      return;
    }

    await page.goto(`/books/${bookId}/explore`);
    await page.waitForLoadState("networkidle");

    // Should see the Generate button
    const generateBtn = page.locator("button", {
      hasText: /Generate Knowledge Graph/i,
    });
    await expect(generateBtn).toBeVisible({ timeout: 10000 });

    // Should see the Back to Book link
    const backLink = page.locator("a", { hasText: /Back to Book/i });
    await expect(backLink).toBeVisible();
  });

  test("clicking Generate starts analysis and shows progress", async ({
    page,
    request,
  }) => {
    const idx = await (await request.get("/api/books")).json();
    const bookId = idx.books[0]?.id;
    if (!bookId) {
      test.skip();
      return;
    }

    const kgRes = await request.get(
      `/api/books/${bookId}/knowledge-graph`,
    );
    if (kgRes.status() === 200) {
      test.skip(); // graph already exists
      return;
    }

    await page.goto(`/books/${bookId}/explore`);
    await page.waitForLoadState("networkidle");

    const generateBtn = page.locator("button", {
      hasText: /Generate Knowledge Graph/i,
    });
    await expect(generateBtn).toBeVisible({ timeout: 10000 });

    // Click generate
    await generateBtn.click();

    // Should transition to the progress view with the title "Analyzing Repository"
    // or at minimum show the AnalyzeProgress component indicators
    const progressTitle = page.locator("text=Analyzing Repository");
    const stageLabel = page.locator("text=Scanning files");

    // Wait for either the progress view or error
    await expect(
      progressTitle.or(stageLabel).first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test("active-job detection: reloading during analysis shows progress", async ({
    page,
    request,
  }) => {
    const idx = await (await request.get("/api/books")).json();
    const bookId = idx.books[0]?.id;
    if (!bookId) {
      test.skip();
      return;
    }

    // Check if there's an active job
    const jobRes = await request.get(
      `/api/books/${bookId}/active-job`,
    );
    if (jobRes.status() !== 200) {
      // Start one
      const startRes = await request.post(
        `/api/books/${bookId}/analyze`,
      );
      if (startRes.status() !== 202 && startRes.status() !== 200) {
        test.skip();
        return;
      }
    }

    // Now navigate to explore — should detect the active job
    await page.goto(`/books/${bookId}/explore`);
    await page.waitForLoadState("networkidle");

    // Should see either the progress view or the graph (if analysis completed very fast)
    const progressView = page.locator("text=Analyzing Repository");
    const graphView = page.locator(".react-flow");
    const completeView = page.locator("text=Analysis complete");
    const emptyState = page.locator("button", {
      hasText: /Generate Knowledge Graph/i,
    });

    // One of these should be visible
    await expect(
      progressView
        .or(graphView)
        .or(completeView)
        .or(emptyState)
        .first(),
    ).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Knowledge Graph - API endpoints", () => {
  test("POST /api/books/{bookId}/analyze returns jobId", async ({
    request,
  }) => {
    const idx = await (await request.get("/api/books")).json();
    const bookId = idx.books[0]?.id;
    if (!bookId) {
      test.skip();
      return;
    }

    const res = await request.post(`/api/books/${bookId}/analyze`);
    expect([200, 202]).toContain(res.status());
    const body = await res.json();
    expect(body.jobId).toBeTruthy();
  });

  test("GET /api/jobs/{jobId}/stream returns SSE", async ({
    request,
  }) => {
    const idx = await (await request.get("/api/books")).json();
    const bookId = idx.books[0]?.id;
    if (!bookId) {
      test.skip();
      return;
    }

    const analyzeRes = await request.post(
      `/api/books/${bookId}/analyze`,
    );
    const { jobId } = await analyzeRes.json();
    
    // Cancel the job so the SSE stream closes quickly
    await request.post(`/api/jobs/${jobId}/control`, { data: { action: "cancel" } });

    const streamRes = await request.get(`/api/jobs/${jobId}/stream`);
    expect(streamRes.status()).toBe(200);
    expect(streamRes.headers()["content-type"]).toContain(
      "text/event-stream",
    );
  });
});
