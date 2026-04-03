"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  
  if (!mounted) {
    return <div className="w-9 h-9" />; // Placeholder to avoid layout shift
  }

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border"
      title="Toggle theme"
    >
      <span className="sr-only">切换浅色/深色模式</span>
      {theme === "dark" ? (
        <Sun className="w-[1.1rem] h-[1.1rem]" strokeWidth={1.5} />
      ) : (
        <Moon className="w-[1.1rem] h-[1.1rem]" strokeWidth={1.5} />
      )}
    </button>
  );
}
