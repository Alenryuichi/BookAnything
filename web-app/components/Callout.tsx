import type { Callout as CalloutType } from "@/lib/types";

const CALLOUT_CONFIG: Record<
  CalloutType["type"],
  { icon: string; label: string; bg: string; bgLight: string; border: string; borderLight: string; accent: string; accentLight: string }
> = {
  tip: {
    icon: "💡",
    label: "提示",
    bg: "rgba(6, 182, 212, 0.08)",
    bgLight: "rgba(6, 182, 212, 0.06)",
    border: "rgba(6, 182, 212, 0.25)",
    borderLight: "rgba(6, 182, 212, 0.3)",
    accent: "#06b6d4",
    accentLight: "#0891b2",
  },
  warning: {
    icon: "⚠️",
    label: "注意",
    bg: "rgba(245, 158, 11, 0.08)",
    bgLight: "rgba(245, 158, 11, 0.06)",
    border: "rgba(245, 158, 11, 0.25)",
    borderLight: "rgba(245, 158, 11, 0.3)",
    accent: "#f59e0b",
    accentLight: "#d97706",
  },
  info: {
    icon: "ℹ️",
    label: "信息",
    bg: "rgba(59, 130, 246, 0.08)",
    bgLight: "rgba(59, 130, 246, 0.06)",
    border: "rgba(59, 130, 246, 0.25)",
    borderLight: "rgba(59, 130, 246, 0.3)",
    accent: "#3b82f6",
    accentLight: "#2563eb",
  },
  quote: {
    icon: "📝",
    label: "引用",
    bg: "rgba(148, 163, 184, 0.08)",
    bgLight: "rgba(100, 116, 139, 0.06)",
    border: "rgba(148, 163, 184, 0.25)",
    borderLight: "rgba(100, 116, 139, 0.2)",
    accent: "#94a3b8",
    accentLight: "#64748b",
  },
};

interface CalloutProps {
  callout: CalloutType;
}

export function Callout({ callout }: CalloutProps) {
  const config = CALLOUT_CONFIG[callout.type] || CALLOUT_CONFIG.info;

  return (
    <div
      className="callout"
      style={{
        background: config.bg,
        border: `1px solid ${config.border}`,
        borderLeft: `4px solid ${config.accent}`,
        borderRadius: 8,
        padding: "16px 20px",
        marginTop: 16,
        marginBottom: 16,
        fontSize: 15,
        lineHeight: 1.8,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4, color: config.accent }}>
        {config.icon} {config.label}
      </div>
      <div style={{ color: "var(--text-primary)" }}>{callout.text}</div>
    </div>
  );
}
