import type { ReactNode } from "react";

export function ControlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border/50 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center justify-end gap-2">{children}</div>
    </div>
  );
}

export function ControlHint({ children }: { children: ReactNode }) {
  return <p className="py-1.5 text-[11px] leading-snug text-muted-foreground">{children}</p>;
}
