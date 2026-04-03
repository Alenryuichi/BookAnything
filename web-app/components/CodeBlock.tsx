import { codeToHtml } from "shiki";
import { CopyButton } from "./CopyButton";

interface CodeBlockProps {
  code: string;
  lang?: string;
}

async function highlightCode(code: string, lang: string): Promise<string | null> {
  try {
    const html = await codeToHtml(code, {
      lang,
      theme: "github-dark-default",
    });
    return html;
  } catch {
    return null;
  }
}

export async function CodeBlock({ code, lang = "typescript" }: CodeBlockProps) {
  if (!code) return null;

  const highlighted = await highlightCode(code, lang);

  const langLabel = lang.toLowerCase() === "bash" ? "sh" : 
                    lang.toLowerCase() === "typescript" ? "ts" : 
                    lang.toLowerCase() === "javascript" ? "js" : lang;

  const header = (
    <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-[#161b22] text-[#8b949e] text-xs font-mono select-none rounded-t-lg">
      <div className="flex items-center gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]"></div>
        <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]"></div>
        <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]"></div>
      </div>
      <div className="flex items-center gap-3">
        <div className="font-semibold uppercase tracking-wider opacity-60">
        {langLabel}
        </div>
        <CopyButton text={code} />
      </div>
    </div>
  );

  if (highlighted) {
    return (
      <div className="my-6 rounded-lg border border-border overflow-hidden bg-[#0d1117] shadow-sm">
        {header}
        <div
          className="code-block-shiki [&>pre]:!m-0 [&>pre]:!bg-transparent [&>pre]:!p-4 [&>pre]:!text-[13px] [&>pre]:!leading-relaxed"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </div>
    );
  }

  // Fallback: plain text
  return (
    <div className="my-6 rounded-lg border border-border overflow-hidden bg-[#0d1117] shadow-sm">
      {header}
      <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed text-[#e6edf3] font-mono">
        <code>
          {code}
        </code>
      </pre>
    </div>
  );
}
