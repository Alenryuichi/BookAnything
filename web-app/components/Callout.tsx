import type { Callout as CalloutType } from "@/lib/types";

const CALLOUT_CONFIG: Record<
  CalloutType["type"],
  { icon: string; label: string; wrapperClass: string; iconClass: string }
> = {
  tip: {
    icon: "💡",
    label: "提示",
    wrapperClass: "bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/50 border-l-blue-500",
    iconClass: "text-blue-500",
  },
  warning: {
    icon: "⚠️",
    label: "注意",
    wrapperClass: "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50 border-l-amber-500",
    iconClass: "text-amber-500",
  },
  info: {
    icon: "ℹ️",
    label: "信息",
    wrapperClass: "bg-zinc-50 dark:bg-zinc-900/30 border-zinc-200 dark:border-zinc-800 border-l-zinc-500",
    iconClass: "text-zinc-500",
  },
  quote: {
    icon: "📝",
    label: "引用",
    wrapperClass: "bg-muted/30 border-border border-l-foreground",
    iconClass: "text-foreground",
  },
};

interface CalloutProps {
  callout: CalloutType;
}

export function Callout({ callout }: CalloutProps) {
  const config = CALLOUT_CONFIG[callout.type] || CALLOUT_CONFIG.info;

  return (
    <div
      className={`callout border rounded-r-lg border-l-4 p-5 my-6 ${config.wrapperClass}`}
    >
      <div className={`font-semibold mb-2 flex items-center gap-2 ${config.iconClass}`}>
        <span>{config.icon}</span> 
        <span>{config.label}</span>
      </div>
      <div className="text-foreground/90 leading-relaxed text-sm">
        {callout.text}
      </div>
    </div>
  );
}
