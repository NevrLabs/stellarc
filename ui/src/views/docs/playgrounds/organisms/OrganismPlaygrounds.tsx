import { useMemo, useState } from "react";
import { getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, flexRender, useReactTable, type ColumnDef, type VisibilityState } from "@tanstack/react-table";
import { Bell, Check, CircleAlert, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ComponentPlayground } from "../ComponentPlayground";
import { ControlRow } from "../controls";

type NodeRow = { id: string; status: "Online" | "Degraded" | "Offline"; agent: string; heartbeat: string };
const NODES: NodeRow[] = [
  { id: "fxcompute-01", status: "Online", agent: "Hermes", heartbeat: "12s" },
  { id: "orbit-02", status: "Degraded", agent: "Codex", heartbeat: "2m" },
  { id: "studio-local", status: "Offline", agent: "Claude Code", heartbeat: "18m" },
  ...Array.from({ length: 24 }, (_, i): NodeRow => ({ id: `worker-${String(i + 1).padStart(2, "0")}`, status: i % 6 === 0 ? "Degraded" : "Online", agent: i % 2 ? "Codex" : "Hermes", heartbeat: `${i + 3}s` })),
];

export function DataTablePlayground() {
  const [state, setState] = useState<"data" | "loading" | "empty" | "error">("data");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [visibility, setVisibility] = useState<VisibilityState>({ heartbeat: true });
  const [virtual, setVirtual] = useState(false);
  const columns = useMemo<ColumnDef<NodeRow>[]>(() => [
    { id: "select", header: "Select", cell: ({ row }) => <Checkbox aria-label={`Select ${row.original.id}`} checked={row.getIsSelected()} onCheckedChange={(value) => row.toggleSelected(Boolean(value))} /> },
    { accessorKey: "id", header: "Node" },
    { accessorKey: "status", header: ({ column }) => <Button variant="ghost" size="sm" aria-label="Sort by status" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>Status</Button>, cell: ({ getValue }) => <Badge variant="outline">{String(getValue())}</Badge> },
    { accessorKey: "agent", header: "Agent" },
    { accessorKey: "heartbeat", header: "Heartbeat" },
  ], []);
  const table = useReactTable({ data: state === "data" ? NODES : [], columns, state: { globalFilter: filter, rowSelection: selected, columnVisibility: visibility }, onGlobalFilterChange: setFilter, onRowSelectionChange: setSelected, onColumnVisibilityChange: setVisibility, getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: virtual ? undefined : getPaginationRowModel(), initialState: { pagination: { pageSize: 8 } } });
  const rows = table.getRowModel().rows;
  return <ComponentPlayground title="Data table" importLine={'import { useReactTable } from "@tanstack/react-table"'} controls={<><ControlRow label="State"><NativeSelect aria-label="Table state" value={state} onChange={(e) => setState(e.target.value as typeof state)}>{["data","loading","empty","error"].map((x) => <NativeSelectOption key={x}>{x}</NativeSelectOption>)}</NativeSelect></ControlRow><ControlRow label="Virtual rows"><Switch checked={virtual} onCheckedChange={setVirtual} /></ControlRow><ControlRow label="Heartbeat column"><Switch checked={visibility.heartbeat !== false} onCheckedChange={(value) => setVisibility({ heartbeat: value })} /></ControlRow></>}>
    <div className="w-full min-w-0 space-y-2"><Input aria-label="Filter nodes" placeholder="Filter nodes…" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
      {state === "loading" ? <div role="status" className="p-8 text-center text-muted-foreground">Loading nodes…</div> : state === "error" ? <div role="alert" className="p-8 text-center text-destructive">Could not load nodes.</div> : state === "empty" ? <div className="p-8 text-center text-muted-foreground">No nodes yet.</div> : <div className={virtual ? "max-h-72 overflow-auto" : "overflow-x-auto"}><Table className="min-w-[640px]"><TableHeader className="sticky top-0 bg-background">{table.getHeaderGroups().map((group) => <TableRow key={group.id}>{group.headers.map((header) => <TableHead key={header.id} style={{ width: header.getSize() }}>{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id} tabIndex={0} data-state={row.getIsSelected() ? "selected" : undefined} onKeyDown={(e) => e.key === "Enter" && row.toggleSelected()}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}</TableBody></Table></div>}
      {!virtual && state === "data" && <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{Object.keys(selected).length} selected</span><div className="flex gap-1"><Button size="sm" variant="outline" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Previous</Button><Button size="sm" variant="outline" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next</Button></div></div>}
    </div>
  </ComponentPlayground>;
}

type SelectorType = "command" | "agent" | "node" | "organization";
const OPTIONS: Record<SelectorType, { name: string; detail: string; unavailable?: boolean }[]> = {
  command: [{ name: "New session", detail: "⌘N" }, { name: "Open history", detail: "⌘H" }],
  agent: [{ name: "Hermes", detail: "Ready" }, { name: "Codex", detail: "Ready" }, { name: "Claude Code", detail: "Unavailable", unavailable: true }],
  node: [{ name: "fxcompute-01", detail: "Online" }, { name: "orbit-02", detail: "Degraded" }, { name: "studio-local", detail: "Disconnected", unavailable: true }],
  organization: [{ name: "NevrLabs", detail: "Current" }, { name: "Personal", detail: "2 projects" }],
};
export function CommandSelectorPlaygrounds() {
  const [type, setType] = useState<SelectorType>("command");
  const [recent, setRecent] = useState(true);
  const [selected, setSelected] = useState(OPTIONS.command[0]);
  const plural = type === "organization" ? "organizations" : `${type}s`;
  return <ComponentPlayground title="Command & selectors" importLine={'import { Command } from "@/components/ui/command"'} controls={<><ControlRow label="Type"><NativeSelect aria-label="Selector type" value={type} onChange={(e) => { const next = e.target.value as SelectorType; setType(next); setSelected(OPTIONS[next][0]); }}><NativeSelectOption value="command">command</NativeSelectOption><NativeSelectOption value="agent">agent</NativeSelectOption><NativeSelectOption value="node">node</NativeSelectOption><NativeSelectOption value="organization">organization</NativeSelectOption></NativeSelect></ControlRow><ControlRow label="Recent group"><Switch checked={recent} onCheckedChange={setRecent} /></ControlRow></>}><div className="grid w-full gap-3 sm:grid-cols-[minmax(0,22rem)_1fr]"><Command className="rounded-lg border"><CommandInput placeholder={`Search ${plural}…`} /><CommandList><CommandEmpty>No {plural} found.</CommandEmpty><CommandGroup heading={recent ? "Recent" : "All"}>{OPTIONS[type].map((option) => <CommandItem key={option.name} disabled={option.unavailable} onSelect={() => setSelected(option)}>{option.name}<CommandShortcut>{option.detail}</CommandShortcut></CommandItem>)}</CommandGroup></CommandList></Command><div className="rounded-lg border p-3 text-sm"><div className="font-medium">{selected.name}</div><div className="text-muted-foreground">{selected.detail}</div></div></div></ComponentPlayground>;
}

type Connection = "connected" | "degraded" | "offline";
export function StatusNotificationPlaygrounds() {
  const [connection, setConnection] = useState<Connection>("connected");
  const [stale, setStale] = useState(false);
  const [held, setHeld] = useState(true);
  const [required, setRequired] = useState<"none" | "input" | "permission">("input");
  const tone = connection === "connected" ? "text-[var(--ok)]" : connection === "degraded" ? "text-[var(--warn)]" : "text-[var(--err)]";
  return <ComponentPlayground title="Status & notifications" importLine={'import { StatusBar, SessionStatusPopover } from "@/components/*"'} controls={<><ControlRow label="Connection"><NativeSelect aria-label="Connection state" value={connection} onChange={(e) => setConnection(e.target.value as Connection)}>{["connected","degraded","offline"].map((x) => <NativeSelectOption key={x}>{x}</NativeSelectOption>)}</NativeSelect></ControlRow><ControlRow label="Stale heartbeat"><Switch checked={stale} onCheckedChange={setStale} /></ControlRow><ControlRow label="Runtime held"><Switch checked={held} onCheckedChange={setHeld} /></ControlRow><ControlRow label="Action required"><NativeSelect aria-label="Action required" value={required} onChange={(e) => setRequired(e.target.value as typeof required)}>{["none","input","permission"].map((x) => <NativeSelectOption key={x}>{x}</NativeSelectOption>)}</NativeSelect></ControlRow></>}><div className="w-full space-y-3"><footer aria-label="Application status" className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-xs"><span className={tone}>{connection === "offline" ? <WifiOff className="mr-1 inline size-3" /> : <Check className="mr-1 inline size-3" />}Axis {connection}</span><span>Heartbeat {stale ? "stale · 4m ago" : "12s ago"}</span><span className="ml-auto">Development</span></footer><div className="flex flex-wrap gap-2"><Popover><PopoverTrigger className={buttonVariants({ variant: "outline" })} aria-label="Session status">Session status</PopoverTrigger><PopoverContent className="w-72 space-y-2 text-xs"><div className="font-medium">Session diagnostics</div><div className="flex justify-between"><span className="text-muted-foreground">runtime held by axis/orbit</span><span>{held ? "yes" : "no"}</span></div><div className="flex justify-between"><span className="text-muted-foreground">heartbeat</span><span>{stale ? "stale" : "healthy"}</span></div></PopoverContent></Popover>{required !== "none" && <div role="status" className="flex items-center gap-2 rounded-lg border border-[var(--warn)]/40 px-3 text-sm"><CircleAlert className="size-4 text-[var(--warn)]" />{required === "input" ? "Input required" : "Permission required"}<Button size="sm" variant="ghost">Review</Button></div>}<div className="flex items-center gap-2 rounded-lg border px-3 text-sm"><Bell className="size-4" />Build finished</div></div></div></ComponentPlayground>;
}
