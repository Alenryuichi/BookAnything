import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SearchTrigger, MobileSearchTrigger } from "@/components/SearchTrigger";
import { TopNavLinks } from "@/components/TopNavLinks";
import Link from "next/link";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "BookAnything",
  description: "把任何仓库变成一本交互式技术书",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${inter.className} bg-background text-foreground antialiased`}>
        <ThemeProvider>
          <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-3 border-b border-border bg-background/80 backdrop-blur-md">
            <div className="flex items-center gap-8">
              <Link href="/books" className="text-base font-bold tracking-tight no-underline text-foreground">
                BookAnything
              </Link>
              <TopNavLinks />
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <SearchTrigger />
              <MobileSearchTrigger />
              <ThemeToggle />
            </div>
          </header>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
