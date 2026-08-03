import { useState } from "react";
import { AlertCircle, Inbox } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComponentPlayground } from "../ComponentPlayground";
import { ControlRow } from "../controls";

const AGENTS = ["Hermes", "Claude Code", "Codex", "Gemini", "OpenCode", "Aider", "Goose", "Amp"];
type SelectMode = "select" | "native" | "searchable" | "multiple";

export function SelectFamilyPlayground() {
  const [mode, setMode] = useState<SelectMode>("select");
  const [disabled, setDisabled] = useState(false);
  const [required, setRequired] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [selected, setSelected] = useState<string[]>(["Hermes"]);
  const options = scrolling ? AGENTS : AGENTS.slice(0, 4);
  const choose = (value: string) => setSelected((current) => mode === "multiple" ? current.includes(value) ? current.filter((x) => x !== value) : [...current, value] : [value]);
  const preview = mode === "native" ? <NativeSelect aria-label="Agent" disabled={disabled} required={required} aria-invalid={invalid} defaultValue="Hermes">{options.map((x) => <NativeSelectOption key={x}>{x}</NativeSelectOption>)}</NativeSelect> : mode === "select" ? <Select disabled={disabled} required={required}><SelectTrigger aria-invalid={invalid} className="w-56"><SelectValue placeholder="Select agent" /></SelectTrigger><SelectContent>{options.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select> : <Command className="w-72 rounded-lg border" aria-disabled={disabled}><CommandInput placeholder="Search agents…" disabled={disabled} /><CommandList className={scrolling ? "max-h-44" : "max-h-28"}><CommandEmpty>No agents found.</CommandEmpty><CommandGroup>{options.map((x) => <CommandItem key={x} disabled={disabled} data-checked={selected.includes(x)} onSelect={() => choose(x)}>{x}</CommandItem>)}</CommandGroup></CommandList>{mode === "multiple" && <div className="border-t p-2 text-xs text-muted-foreground">Selected: {selected.join(", ") || "none"}</div>}</Command>;
  return <ComponentPlayground title="Select & Combobox" importLine={'import { Select } from "@/components/ui/select"'} controls={<><ControlRow label="Type"><NativeSelect aria-label="Select type" value={mode} onChange={(e) => setMode(e.target.value as SelectMode)}>{["select","native","searchable","multiple"].map((x) => <NativeSelectOption key={x}>{x}</NativeSelectOption>)}</NativeSelect></ControlRow><ControlRow label="Disabled"><Switch checked={disabled} onCheckedChange={setDisabled} /></ControlRow><ControlRow label="Required"><Switch checked={required} onCheckedChange={setRequired} /></ControlRow><ControlRow label="Invalid"><Switch checked={invalid} onCheckedChange={setInvalid} /></ControlRow><ControlRow label="Long list"><Switch checked={scrolling} onCheckedChange={setScrolling} /></ControlRow></>}>{preview}</ComponentPlayground>;
}

export function DisclosurePlaygrounds() {
  const [multiple, setMultiple] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [open, setOpen] = useState(false);
  return <><ComponentPlayground title="Accordion" importLine={'import { Accordion } from "@/components/ui/accordion"'} controls={<><ControlRow label="Multiple"><Switch checked={multiple} onCheckedChange={setMultiple} /></ControlRow><ControlRow label="Disabled item"><Switch checked={disabled} onCheckedChange={setDisabled} /></ControlRow></>}><Accordion multiple={multiple} className="w-80"><AccordionItem value="runtime"><AccordionTrigger>Runtime details</AccordionTrigger><AccordionContent>PID 4182 · healthy</AccordionContent></AccordionItem><AccordionItem value="network" disabled={disabled}><AccordionTrigger>Network</AccordionTrigger><AccordionContent>Loopback only</AccordionContent></AccordionItem></Accordion></ComponentPlayground><ComponentPlayground title="Collapsible" importLine={'import { Collapsible } from "@/components/ui/collapsible"'} controls={<ControlRow label="Open"><Switch checked={open} onCheckedChange={setOpen} /></ControlRow>}><Collapsible open={open} onOpenChange={setOpen} className="w-72"><CollapsibleTrigger render={<Button variant="outline">{open ? "Hide" : "Show"} node details</Button>} /><CollapsibleContent className="pt-3 text-sm">Last heartbeat 12 seconds ago.</CollapsibleContent></Collapsible></ComponentPlayground></>;
}

export function TabsPlayground() {
  const [vertical, setVertical] = useState(false);
  return <ComponentPlayground title="Tabs" importLine={'import { Tabs } from "@/components/ui/tabs"'} controls={<ControlRow label="Vertical"><Switch checked={vertical} onCheckedChange={setVertical} /></ControlRow>}><Tabs defaultValue="output" orientation={vertical ? "vertical" : "horizontal"} className="w-80"><TabsList><TabsTrigger value="output">Output</TabsTrigger><TabsTrigger value="events">Events</TabsTrigger><TabsTrigger value="files" disabled>Files</TabsTrigger></TabsList><TabsContent value="output">Run output stream.</TabsContent><TabsContent value="events">Event log.</TabsContent></Tabs></ComponentPlayground>;
}

export function BreadcrumbPlayground() {
  return <ComponentPlayground title="Breadcrumb" importLine={'import { Breadcrumb } from "@/components/ui/breadcrumb"'} controls={undefined}><Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href="#">Fleet</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbLink href="#">Nodes</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>fxcompute-01</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb></ComponentPlayground>;
}

export function PaginationPlayground() {
  const [page, setPage] = useState(2);
  return <ComponentPlayground title="Pagination" importLine="Native nav — no wrapper" controls={<ControlRow label="Current page"><Input aria-label="Current page" type="number" min={1} max={5} value={page} onChange={(e) => setPage(Math.min(5, Math.max(1, Number(e.target.value))))} className="h-7 w-20" /></ControlRow>}><nav aria-label="Pagination" className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-sm">Page {page} of 5</span><Button variant="outline" size="sm" disabled={page === 5} onClick={() => setPage(page + 1)}>Next</Button></nav></ComponentPlayground>;
}

export function ContentPlaygrounds() {
  const [state, setState] = useState<"data" | "empty" | "error">("data");
  const [compact, setCompact] = useState(false);
  return <><ComponentPlayground title="Alert & Empty" importLine={'import { Alert, Empty } from "@/components/ui/*"'} controls={<ControlRow label="State"><NativeSelect aria-label="Content state" value={state} onChange={(e) => setState(e.target.value as typeof state)}><NativeSelectOption value="data">Alert</NativeSelectOption><NativeSelectOption value="empty">Empty</NativeSelectOption><NativeSelectOption value="error">Error</NativeSelectOption></NativeSelect></ControlRow>}>{state === "empty" ? <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><Inbox /></EmptyMedia><EmptyTitle>No sessions</EmptyTitle><EmptyDescription>Start a session to see it here.</EmptyDescription></EmptyHeader><EmptyContent><Button size="sm">New session</Button></EmptyContent></Empty> : <Alert variant={state === "error" ? "destructive" : "default"} className="max-w-lg"><AlertCircle /><AlertTitle>{state === "error" ? "Connection lost" : "Runtime held"}</AlertTitle><AlertDescription>{state === "error" ? "Reconnect before sending messages." : "This runtime is reserved by another session."}</AlertDescription><AlertAction><Button size="sm" variant="outline">Details</Button></AlertAction></Alert>}</ComponentPlayground><ComponentPlayground title="Table" importLine={'import { Table } from "@/components/ui/table"'} controls={<ControlRow label="Compact"><Switch checked={compact} onCheckedChange={setCompact} /></ControlRow>}><div data-testid="table-overflow" className="w-full overflow-x-auto"><Table className="min-w-[640px]"><TableHeader className="sticky top-0 bg-background"><TableRow><TableHead>Node</TableHead><TableHead>Status</TableHead><TableHead>Agent</TableHead><TableHead>Last heartbeat</TableHead></TableRow></TableHeader><TableBody>{[["fxcompute-01","Online","Hermes","12s"],["orbit-02","Degraded","Codex","2m"]].map((row) => <TableRow key={row[0]}>{row.map((cell) => <TableCell key={cell} className={compact ? "py-1" : "py-3"}>{cell}</TableCell>)}</TableRow>)}</TableBody></Table></div></ComponentPlayground><ComponentPlayground title="Scroll Area" importLine={'import { ScrollArea } from "@/components/ui/scroll-area"'} controls={undefined}><ScrollArea className="h-32 w-72 rounded-lg border p-3"><div className="space-y-2">{AGENTS.concat(AGENTS).map((x, i) => <div key={`${x}-${i}`} className="text-sm">{i + 1}. {x}</div>)}</div></ScrollArea></ComponentPlayground></>;
}
