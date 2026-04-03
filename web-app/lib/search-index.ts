import type { ModuleAnalysis, ChapterContent } from "./types";


function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface SearchEntry {
  id: string;
  title: string;
  content: string;
  type: "chapter" | "section" | "module" | "pattern" | "type";
  href: string;
}

export function buildSearchEntries(
  modules: Record<string, ModuleAnalysis>,
  chapters: Record<string, ChapterContent>,
  bookId?: string
): SearchEntry[] {
  const entries: SearchEntry[] = [];
  const chapterBase = bookId ? `/books/${bookId}/chapters` : "/chapters";
  const moduleBase = bookId ? `/books/${bookId}/modules` : "/modules";

  for (const [id, ch] of Object.entries(chapters)) {
    entries.push({
      id,
      title: ch.title,
      content: [ch.subtitle, ch.opening_hook, ...(ch.key_takeaways || []), ...(ch.analogies || [])].join(" "),
      type: "chapter",
      href: `${chapterBase}/${id}`,
    });
    for (const [i, section] of (ch.sections || []).entries()) {
      entries.push({
        id: `${id}:section:${i}`,
        title: `${ch.title} › ${section.heading}`,
        content: section.content,
        type: "section",
        href: `${chapterBase}/${id}#${slugify(section.heading)}`,
      });
    }
  }

  for (const [id, mod] of Object.entries(modules)) {
    entries.push({
      id: `mod:${id}`,
      title: mod.module_name,
      content: [mod.overview, mod.design_philosophy, ...mod.design_patterns].join(" "),
      type: "module",
      href: `${moduleBase}/${id}`,
    });
  }

  return entries;
}
