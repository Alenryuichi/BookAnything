"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "6px 12px",
        cursor: "pointer",
        color: "var(--text-primary)",
        fontSize: 14,
      }}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? "☀️ 亮色" : "🌙 暗色"}
    </button>
  );
}
