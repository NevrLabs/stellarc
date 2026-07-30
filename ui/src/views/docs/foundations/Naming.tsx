export function Naming() {
  return <div className="prose prose-sm dark:prose-invert max-w-none">
    <p>Use one word per shell concept in code, docs, cards, and reviews.</p>
    <div className="not-prose my-6 rounded-xl border border-border bg-muted/20 p-4" role="img" aria-label="View contains Sidebar and Page; Page contains Viewport; Viewport contains Panels; Panels contain Content and Drawers">
      <div className="mb-2 text-center text-xs font-semibold">View</div>
      <div className="grid min-h-52 grid-cols-[9rem_1fr] gap-2">
        <div className="rounded-md border border-border bg-background p-3 text-center text-xs font-semibold">Sidebar</div>
        <div className="rounded-md border border-border bg-background p-3">
          <div className="mb-2 text-center text-xs font-semibold">Page</div>
          <div className="rounded border border-dashed border-border p-2">
            <div className="mb-2 text-center text-xs">Viewport</div>
            <div className="rounded border border-dashed border-border p-3 text-center text-xs">Panel(s)<div className="mt-2 grid gap-2 text-muted-foreground sm:grid-cols-2"><span>Content</span><span>Drawers</span></div></div>
          </div>
        </div>
      </div>
      <div className="mt-2 text-center text-[10px] uppercase tracking-wide text-muted-foreground">View → Sidebar + Page → Viewport → Panel(s) → Content + Drawers</div>
    </div>
  </div>;
}
