"use client";

export function SearchTrigger() {
  return (
    <button
      onClick={() => document.dispatchEvent(new Event("open-cmdk"))}
      className="hidden sm:flex items-center justify-between w-64 px-3 py-1.5 text-sm text-muted-foreground bg-muted/50 hover:bg-muted border border-border/50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-border"
      aria-label="Search documentation"
    >
      <div className="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <span className="font-medium">Search documentation...</span>
      </div>
      <kbd className="font-sans text-[10px] font-medium bg-background border border-border px-1.5 py-0.5 rounded text-foreground/70 shadow-sm">
        ⌘K
      </kbd>
    </button>
  );
}

export function MobileSearchTrigger() {
  return (
    <button
      onClick={() => document.dispatchEvent(new Event("open-cmdk"))}
      className="sm:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
      aria-label="Search"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
    </button>
  );
}
