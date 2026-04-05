"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TopNavLinks() {
  const pathname = usePathname();
  
  // Extract bookId from /books/[bookId]/...
  const match = pathname.match(/^\/books\/([^/]+)/);
  const bookId = match ? match[1] : null;

  return (
    <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-muted-foreground">
      <Link href="/books" className="hover:text-foreground transition-colors">书架</Link>
      <a href="https://github.com/kylinmiao/bookanything" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors flex items-center gap-1.5">
        GitHub
      </a>
    </nav>
  );
}
