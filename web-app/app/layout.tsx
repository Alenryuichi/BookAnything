import type { Metadata } from "next";
import "@/styles/globals.css";
import { Sidebar } from "@/components/Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThemeProvider } from "@/components/ThemeProvider";
import { loadKnowledge, loadParts, loadBookTitle } from "@/lib/load-knowledge";

const bookTitle = loadBookTitle();

export const metadata: Metadata = {
  title: bookTitle,
  description: `一本由浅入深的交互式技术书`,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let knowledge = { chapters: {}, modules: {} };
  let parts: any[] = [];

  try {
    knowledge = loadKnowledge();
    parts = loadParts();
  } catch (error) {
    console.warn("Failed to load knowledge data:", error);
    // 使用空数据作为回退
  }

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <Sidebar chapters={knowledge.chapters} parts={parts} bookTitle={bookTitle} />
          <div className="main-content">
            <header
              style={{
                position: "sticky",
                top: 0,
                zIndex: 30,
                background: "var(--bg-primary)",
                borderBottom: "1px solid var(--border)",
                padding: "12px 24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h1 style={{ fontSize: 16, fontWeight: 700 }}>
                📖 {bookTitle}
              </h1>
              <ThemeToggle />
            </header>
            <main style={{ padding: "24px 24px 80px" }}>
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
