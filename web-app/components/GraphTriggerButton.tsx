"use client";

export function GraphTriggerButton({ className, children }: { className?: string, children: React.ReactNode }) {
  return (
    <button 
      onClick={() => document.dispatchEvent(new Event("open-graph-modal"))}
      className={className}
    >
      {children}
    </button>
  );
}
