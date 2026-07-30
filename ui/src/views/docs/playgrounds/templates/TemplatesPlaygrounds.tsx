import { useState } from "react";
import { AlertTriangle, FolderKanban, MessageSquare, Server, StickyNote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PROJECTS, SESSIONS, VAULTS } from "@/mocks/fixtures";
import { ComponentPlayground } from "../ComponentPlayground";
import { ControlRow } from "../controls";

type DrawerSide = "left" | "bottom" | "right";
type DrawerMode = "hidden" | "full" | "floating";
type Page = "sessions" | "vaults" | "projects" | "fleet";
type PageState = "loading" | "empty" | "populated" | "error" | "disconnected" | "permissions" | "long";

const select = <T extends string>(label: string, value: T, setValue: (value: T) => void, values: readonly T[]) => (
  <NativeSelect aria-label={label} value={value} onChange={(event) => setValue(event.target.value as T)}>
    {values.map((item) => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}
  </NativeSelect>
);

function StatusBar() {
  return <footer className="flex items-center justify-between border-t bg-muted/30 px-3 py-1 text-[11px] text-muted-foreground"><span>Axis connected</span><span>3 nodes · synced</span></footer>;
}

export function ViewTemplatePlayground() {
  const [view, setView] = useState<"sessions" | "projects">("sessions");
  const [side, setSide] = useState<DrawerSide>("bottom");
  const [mode, setMode] = useState<DrawerMode>("full");
  const drawer = mode !== "hidden" && <aside data-testid="template-drawer" data-side={side} data-mode={mode} className={`${mode === "floating" ? "m-2 rounded-lg border shadow-lg" : "border-border"} ${side === "bottom" ? "border-t p-3" : side === "left" ? "border-r p-3" : "border-l p-3"}`}><strong className="text-xs">{side} drawer</strong><p className="mt-1 text-xs text-muted-foreground">Inspector and workbench content stays outside third-party canvases.</p></aside>;
  return <ComponentPlayground title="View, panels, and drawers" importLine="Template composition — no generic production wrapper" controls={<>
    <ControlRow label="View type">{select("View type", view, setView, ["sessions", "projects"] as const)}</ControlRow>
    <ControlRow label="Drawer side">{select("Drawer side", side, setSide, ["left", "bottom", "right"] as const)}</ControlRow>
    <ControlRow label="Drawer mode">{select("Drawer mode", mode, setMode, ["hidden", "full", "floating"] as const)}</ControlRow>
  </>}>
    <div className="flex h-80 w-full min-w-0 flex-col overflow-hidden rounded-lg border bg-background">
      <div className="flex min-h-0 flex-1">
        <nav className="w-28 shrink-0 border-r p-2 text-xs"><strong>Sidebar</strong><div className="mt-2 rounded bg-muted p-2">{view === "sessions" ? "Sessions" : "Projects"}</div></nav>
        {side === "left" && drawer}
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b px-3 py-2"><strong>{view === "sessions" ? "Session transcript" : "Project board"}</strong><Button size="sm" variant="outline">Action</Button></header>
          <div className={`grid min-h-0 flex-1 gap-2 overflow-auto p-3 ${view === "projects" ? "grid-cols-3" : "grid-cols-1"}`}>
            {(view === "projects" ? ["Todo", "Running", "Done"] : ["Single content panel"]).map((label) => <section key={label} className="rounded border bg-muted/20 p-3 text-sm"><strong>{label}</strong><p className="mt-2 text-muted-foreground">Panel Header + Content</p></section>)}
          </div>
          {side === "bottom" && drawer}
        </main>
        {side === "right" && drawer}
      </div>
      <StatusBar />
    </div>
  </ComponentPlayground>;
}

const pageMeta = {
  sessions: { icon: MessageSquare, count: SESSIONS.length, noun: "sessions" },
  vaults: { icon: StickyNote, count: VAULTS.length, noun: "vaults" },
  projects: { icon: FolderKanban, count: PROJECTS.length, noun: "projects" },
  fleet: { icon: Server, count: 3, noun: "nodes" },
} as const;

export function PageStatesPlayground() {
  const [page, setPage] = useState<Page>("sessions");
  const [state, setState] = useState<PageState>("populated");
  const [narrow, setNarrow] = useState(false);
  const meta = pageMeta[page];
  const Icon = meta.icon;
  let content = <div className="grid gap-2 sm:grid-cols-3">{Array.from({ length: state === "long" ? 18 : Math.min(meta.count, 6) }, (_, i) => <Card key={i}><CardHeader className="pb-2"><CardTitle className="text-sm">{page} item {i + 1}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Representative fixture content</CardContent></Card>)}</div>;
  if (state === "loading") content = <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (state === "empty") content = <div className="grid place-items-center py-16 text-center"><Icon className="mb-2 size-8 text-muted-foreground"/><strong>No {meta.noun}</strong><Button className="mt-3" size="sm">Create one</Button></div>;
  if (state === "error") content = <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/40 p-4 text-destructive"><AlertTriangle className="size-4"/>{page[0].toUpperCase() + page.slice(1)} failed to load</div>;
  if (state === "disconnected") content = <div role="status" className="rounded-lg border p-4"><Badge variant="destructive">Disconnected</Badge><p className="mt-2 text-sm">Cached content remains readable.</p></div>;
  if (state === "permissions") content = <div role="status" className="rounded-lg border p-4 text-sm">You need permission to view {meta.noun}.</div>;
  return <ComponentPlayground title="Representative page states" importLine={'import fixtures from "@/mocks/fixtures"'} controls={<>
    <ControlRow label="Page">{select("Page", page, setPage, ["sessions", "vaults", "projects", "fleet"] as const)}</ControlRow>
    <ControlRow label="State">{select("State", state, setState, ["loading", "empty", "populated", "error", "disconnected", "permissions", "long"] as const)}</ControlRow>
    <ControlRow label="Narrow viewport"><Switch checked={narrow} onCheckedChange={setNarrow} /></ControlRow>
  </>}>
    <div className={`${narrow ? "max-w-sm" : "w-full"} overflow-hidden rounded-lg border`}>
      <header className="flex items-center justify-between border-b p-3"><div className="flex items-center gap-2"><Icon className="size-4"/><strong className="capitalize">{page}</strong></div><Badge variant="outline">{meta.count} {meta.noun} from MSW fixtures</Badge></header>
      <div className="max-h-96 overflow-auto p-3">{content}</div>
      <StatusBar />
    </div>
  </ComponentPlayground>;
}
