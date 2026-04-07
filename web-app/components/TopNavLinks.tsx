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
      <Link href="/books/new" className="hover:text-foreground transition-colors text-blue-500 font-semibold flex items-center gap-1">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        New Book
      </Link>
      <a href="https://github.com/kylinmiao/bookanything" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors flex items-center gap-1.5">
        GitHub
      </a>
    </nav>
  );
}
