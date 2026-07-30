import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ComponentPlayground({ title, importLine, controls, children }: {
  title: string;
  importLine: string;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-6 w-full max-w-5xl overflow-hidden rounded-xl border border-border bg-background">
      <header className="border-b border-border px-5 py-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Component Playground</div>
        <h3 className="mt-0.5 text-base font-semibold">{title}</h3>
        <code className="mt-1 block text-xs text-muted-foreground">{importLine}</code>
      </header>
      <div className={cn("grid", controls && "md:grid-cols-[minmax(0,1fr)_17rem]")}>
        <div className="flex min-h-32 min-w-0 flex-wrap items-center gap-3 bg-muted/10 p-5">{children}</div>
        {controls && (
          <aside className="border-t border-border bg-muted/20 px-4 py-3 md:border-l md:border-t-0" aria-label={`${title} configuration`}>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Configuration</div>
            {controls}
          </aside>
        )}
      </div>
    </section>
  );
}
