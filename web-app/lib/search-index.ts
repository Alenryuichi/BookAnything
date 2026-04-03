import type { ModuleAnalysis, ChapterContent } from "./types";

export interface SearchEntry {
  id: string;
  title: string;
  content: string;
  type: "chapter" | "section" | "module" | "pattern" | "type";
  href: string;
}

export function buildSearchEntries(
  modules: Record<string, ModuleAnalysis>,
  chapters: Record<string, ChapterContent>
): SearchEntry[] {
  const entries: SearchEntry[] = [];

  // Index chapters (primary content now)
  for (const [id, ch] of Object.entries(chapters)) {
    // Chapter overview
    entries.push({
      id,
      title: ch.title,
      content: [
        ch.subtitle,
        ch.opening_hook,
        ...(ch.key_takeaways || []),
        ...(ch.analogies || []),
      ].join(" "),
      type: "chapter",
      href: `/chapters/${id}`,
    });

    // Each section is searchable
    for (const [i, section] of (ch.sections || []).entries()) {
      entries.push({
        id: `${id}:section:${i}`,
        title: `${ch.title} › ${section.heading}`,
        content: section.content,
        type: "section",
        href: `/chapters/${id}`,
      });
    }
  }

  // Index legacy modules
  for (const [id, mod] of Object.entries(modules)) {
    entries.push({
      id: `mod:${id}`,
      title: mod.module_name,
      content: [mod.overview, mod.design_philosophy, ...mod.design_patterns].join(" "),
      type: "module",
      href: `/modules/${id}`,
    });
  }

  return entries;
}
