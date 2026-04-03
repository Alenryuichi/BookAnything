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
    if (!ch) continue;

    // Chapter overview
    entries.push({
      id,
      title: ch.title || id,
      content: [
        ch.subtitle || "",
        ch.opening_hook || "",
        ch.chapter_summary || "",
        ...(ch.key_takeaways || []),
        ...(ch.analogies || []),
        ...(ch.further_thinking || []),
      ].filter(Boolean).join(" "),
      type: "chapter",
      href: `/chapters/${id}`,
    });

    // Each section is searchable
    for (const [i, section] of (ch.sections || []).entries()) {
      if (!section) continue;

      entries.push({
        id: `${id}:section:${i}`,
        title: `${ch.title || id} › ${section.heading || "未命名小节"}`,
        content: [
          section.content || "",
          section.callout?.text || "",
          section.code?.description || "",
          section.code?.annotation || "",
          section.diagram?.description || "",
        ].filter(Boolean).join(" "),
        type: "section",
        href: `/chapters/${id}`,
      });
    }
  }

  // Index legacy modules
  for (const [id, mod] of Object.entries(modules)) {
    if (!mod) continue;

    entries.push({
      id: `mod:${id}`,
      title: mod.module_name || id,
      content: [
        mod.overview || "",
        mod.design_philosophy || "",
        ...(mod.design_patterns || []),
        ...(mod.extension_points || []),
        mod.mermaid_diagram || "",
      ].filter(Boolean).join(" "),
      type: "module",
      href: `/modules/${id}`,
    });

    // Index core types
    for (const [i, type] of (mod.core_types || []).entries()) {
      if (!type) continue;

      entries.push({
        id: `mod:${id}:type:${i}`,
        title: `${mod.module_name || id} › ${type.name || "未命名类型"}`,
        content: [type.purpose || "", type.code || ""].filter(Boolean).join(" "),
        type: "type",
        href: `/modules/${id}`,
      });
    }

    // Index key implementations
    for (const [i, impl] of (mod.key_implementations || []).entries()) {
      if (!impl) continue;

      entries.push({
        id: `mod:${id}:impl:${i}`,
        title: `${mod.module_name || id} › ${impl.name || "未命名实现"}`,
        content: [impl.description || "", impl.explanation || ""].filter(Boolean).join(" "),
        type: "pattern",
        href: `/modules/${id}`,
      });
    }
  }

  return entries;
}
