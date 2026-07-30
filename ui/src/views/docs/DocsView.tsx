// ── /docs — design system reference ─────────────────────────────
// Sidebar = page select (Design System / Guidelines / Themes).
// Design System is ONE scrollable page with Foundations + Components
// sections; section links (indented under the page entry) jump instantly.
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ButtonGroup } from "@/components/ui/button-group";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { TanStackChartDemo } from "./TanStackChartDemo";

// ── Token inventories (names only — values come from the live theme) ──
const COLOR_TOKENS = [
  "--bg", "--bg-elev", "--bg-elev-2", "--bg-hover", "--bg-active",
  "--border", "--border-faint", "--border-strong",
  "--text", "--text-dim", "--text-faint",
  "--accent", "--accent-bright", "--accent-subtle", "--accent-wash", "--accent-ink",
  "--ok", "--ok-wash", "--ok-ink",
  "--warn", "--warn-wash", "--warn-ink",
  "--err", "--err-wash", "--err-ink",
];
const SPACE_TOKENS = ["--space-1", "--space-2", "--space-3", "--space-4", "--space-5", "--space-6", "--space-8", "--space-12", "--space-16", "--space-24"];
const RADIUS_TOKENS = ["--radius-sm", "--radius-md", "--radius-lg", "--radius-full"];
const TYPE_TOKENS = ["--fs-11", "--fs-12", "--fs-13", "--fs-14", "--fs-16", "--fs-20"];
const MOTION_TOKENS = ["--dur-fast", "--dur-base", "--dur-slow", "--ease-out", "--loop-spin"];

function useToken(name: string): string {
  const [v, setV] = useState("");
  useEffect(() => {
    setV(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
  }, [name]);
  return v;
}

function TokenRow({ name }: { name: string }) {
  const value = useToken(name);
  if (!value) return null;
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-border/40 text-sm">
      <span
        className="size-6 shrink-0 rounded-md border border-border"
        style={{ background: `var(${name})` }}
      />
      <code className="w-52 shrink-0 text-xs">{name}</code>
      <code className="text-xs text-muted-foreground">{value}</code>
    </div>
  );
}

function ScalarRow({ name, preview }: { name: string; preview?: React.ReactNode }) {
  const value = useToken(name);
  if (!value) return null;
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-border/40 text-sm">
      <code className="w-52 shrink-0 text-xs">{name}</code>
      <code className="w-24 shrink-0 text-xs text-muted-foreground">{value}</code>
      {preview}
    </div>
  );
}

function Demo({ title, importLine, children }: {
  title: string; importLine: string; children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h3 className="text-base font-semibold mb-1">{title}</h3>
      <code className="block text-xs text-muted-foreground mb-3">{importLine}</code>
      <div className="rounded-lg border border-border p-6 flex flex-wrap items-center gap-3 bg-background">
        {children}
      </div>
    </section>
  );
}

// ── Themes page helpers ──────────────────────────────────────────
// Read BOTH theme blocks straight out of the loaded stylesheets, without
// flipping the app theme: rules matching :root[data-theme="..."] carry the
// custom properties for each theme.
type ThemeTable = Record<string, Record<string, string>>;

function readThemeTables(): ThemeTable {
  const themes: ThemeTable = {};
  const visit = (rules: CSSRuleList) => {
    for (const r of Array.from(rules)) {
      if (r instanceof CSSMediaRule || r instanceof CSSSupportsRule) {
        visit(r.cssRules);
        continue;
      }
      if (!(r instanceof CSSStyleRule)) continue;
      const m = r.selectorText.match(/:root\[data-theme="([a-z-]+)"\]/);
      if (!m) continue;
      const bucket = (themes[m[1]] ??= {});
      for (const prop of Array.from(r.style)) {
        if (prop.startsWith("--")) bucket[prop] = r.style.getPropertyValue(prop).trim();
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try { visit(sheet.cssRules); } catch { /* cross-origin sheet */ }
  }
  return themes;
}

function ThemesPage() {
  const [themes, setThemes] = useState<ThemeTable>({});
  useEffect(() => { setThemes(readThemeTables()); }, []);
  const names = Object.keys(themes);
  if (names.length === 0) {
    return <p className="text-sm text-muted-foreground">No theme blocks found in loaded stylesheets.</p>;
  }
  return (
    <div className="space-y-6">
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <p>
          Themes are CSS custom-property blocks on <code>{'html[data-theme="…"]'}</code> in{" "}
          <code>ui/src/design/tokens/colors.css</code>. The active theme is toggled from the top
          bar and persisted to <code>localStorage</code>. Every component and plugin consumes
          tokens only, so a new theme is one CSS block — no component changes.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 pr-4 font-medium">token</th>
              {names.map((n) => (
                <th key={n} className="py-2 pr-4 font-medium">{n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COLOR_TOKENS.filter((t) => names.some((n) => themes[n][t])).map((t) => (
              <tr key={t} className="border-b border-border/40">
                <td className="py-1.5 pr-4"><code>{t}</code></td>
                {names.map((n) => (
                  <td key={n} className="py-1.5 pr-4">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="size-4 shrink-0 rounded border border-border"
                        style={{ background: themes[n][t] ?? "transparent" }}
                      />
                      <code className="text-muted-foreground">{themes[n][t] ?? "—"}</code>
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GuidelinesPage() {
  const [md, setMd] = useState<string>("Loading…");
  useEffect(() => {
    import("../../../../docs/design/DESIGN_SYSTEM.md?raw")
      .then((m) => setMd(m.default))
      .catch(() => setMd("Failed to load DESIGN_SYSTEM.md"));
  }, []);
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
    </div>
  );
}

// ── Design System sections (one scrollable page) ─────────────────
type Section = { slug: string; title: string; group: string; feature?: "extended"; render: () => React.ReactNode };

const SECTIONS: Section[] = [
  {
    slug: "overview", title: "Overview", group: "Foundations",
    render: () => (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <p>
          Every Stellarc surface — core UI and plugins alike — builds from three layers:
        </p>
        <ol>
          <li><strong>Tokens</strong> (<code>ui/src/design/tokens/*.css</code>) — colors, type, spacing, radius, motion. Both themes. Never hardcode a hex.</li>
          <li><strong>Primitives</strong> (<code>ui/src/components/ui/*</code>) — base-ui behavior + cva variants + Tailwind styling. Import these; do not re-implement buttons.</li>
          <li><strong>Patterns</strong> — composition rules in Guidelines (row highlight ladder, resizable sidebars, tab semantics).</li>
        </ol>
        <p>
          Plugin rule: a plugin ships <em>no palette of its own</em>. A visual need not covered
          here is a design-system change first, a plugin change second.
        </p>
      </div>
    ),
  },
  {
    slug: "colors", title: "Colors", group: "Foundations",
    render: () => (
      <div>
        <p className="text-sm text-muted-foreground mb-4">Live values from the active theme; see the Themes page for both blocks side by side.</p>
        {COLOR_TOKENS.map((t) => <TokenRow key={t} name={t} />)}
      </div>
    ),
  },
  {
    slug: "typography", title: "Typography", group: "Foundations",
    render: () => (
      <div>
        {TYPE_TOKENS.map((t) => (
          <ScalarRow key={t} name={t} preview={<span style={{ fontSize: `var(${t})` }}>The quick brown fox</span>} />
        ))}
      </div>
    ),
  },
  {
    slug: "spacing", title: "Spacing", group: "Foundations",
    render: () => (
      <div>
        {SPACE_TOKENS.map((t) => (
          <ScalarRow key={t} name={t} preview={<span className="inline-block h-3 bg-primary/60" style={{ width: `var(${t})` }} />} />
        ))}
      </div>
    ),
  },
  {
    slug: "radius", title: "Radius", group: "Foundations",
    render: () => (
      <div>
        {RADIUS_TOKENS.map((t) => (
          <ScalarRow key={t} name={t} preview={<span className="inline-block size-8 border border-border bg-muted" style={{ borderRadius: `var(${t})` }} />} />
        ))}
      </div>
    ),
  },
  {
    slug: "motion", title: "Motion", group: "Foundations",
    render: () => (
      <div>
        <p className="text-sm text-muted-foreground mb-4">Interaction transitions cap at 150ms. Loops use the shared keyframes.</p>
        {MOTION_TOKENS.map((t) => <ScalarRow key={t} name={t} />)}
      </div>
    ),
  },
  {
    slug: "buttons", title: "Button", group: "Atoms",
    render: () => (
      <>
        <Demo title="Variants" importLine={'import { Button } from "@/components/ui/button"'}>
          <Button variant="default">Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </Demo>
        <Demo title="Sizes" importLine={'import { Button } from "@/components/ui/button"'}>
          <Button variant="outline" size="xs">xs</Button>
          <Button variant="outline" size="sm">sm</Button>
          <Button variant="outline" size="default">default</Button>
          <Button variant="outline" size="lg">lg</Button>
        </Demo>
      </>
    ),
  },
  {
    slug: "badge", title: "Badge", group: "Atoms",
    render: () => (
      <Demo title="Badge" importLine={'import { Badge } from "@/components/ui/badge"'}>
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="destructive">Destructive</Badge>
      </Demo>
    ),
  },
  {
    slug: "card", title: "Card", group: "Molecules",
    render: () => (
      <Demo title="Card" importLine={'import { Card, CardHeader, ... } from "@/components/ui/card"'}>
        <Card className="w-72">
          <CardHeader>
            <CardTitle>Node fxcompute-01</CardTitle>
            <CardDescription>2 agents · online</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">Last heartbeat 12s ago.</CardContent>
          <CardFooter><Button size="sm" variant="outline">Inspect</Button></CardFooter>
        </Card>
      </Demo>
    ),
  },
  {
    slug: "inputs", title: "Input / Textarea", group: "Atoms",
    render: () => (
      <Demo title="Text fields" importLine={'import { Input } from "@/components/ui/input"'}>
        <div className="grid gap-3 w-64">
          <Label htmlFor="d-in">Session name</Label>
          <Input id="d-in" placeholder="e.g. auth refactor" />
          <Textarea placeholder="Notes…" rows={3} />
        </div>
      </Demo>
    ),
  },
  {
    slug: "select", title: "Select", group: "Molecules",
    render: () => (
      <Demo title="Select" importLine={'import { Select, ... } from "@/components/ui/select"'}>
        <Select defaultValue="hermes">
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="hermes">Hermes</SelectItem>
            <SelectItem value="claude-code">Claude Code</SelectItem>
            <SelectItem value="codex">Codex</SelectItem>
          </SelectContent>
        </Select>
      </Demo>
    ),
  },
  {
    slug: "toggles", title: "Checkbox / Switch", group: "Atoms",
    render: () => (
      <Demo title="Toggles" importLine={'import { Checkbox } from "@/components/ui/checkbox"'}>
        <label className="flex items-center gap-2 text-sm"><Checkbox defaultChecked /> Auto-archive</label>
        <label className="flex items-center gap-2 text-sm"><Switch defaultChecked /> Live updates</label>
      </Demo>
    ),
  },
  {
    slug: "tabs", title: "Tabs", group: "Molecules",
    render: () => (
      <Demo title="Tabs" importLine={'import { Tabs, TabsList, ... } from "@/components/ui/tabs"'}>
        <Tabs defaultValue="a" className="w-80">
          <TabsList>
            <TabsTrigger value="a">Output</TabsTrigger>
            <TabsTrigger value="b">Events</TabsTrigger>
            <TabsTrigger value="c">Files</TabsTrigger>
          </TabsList>
          <TabsContent value="a" className="text-sm p-2">Run output stream.</TabsContent>
          <TabsContent value="b" className="text-sm p-2">Event log.</TabsContent>
          <TabsContent value="c" className="text-sm p-2">Touched files.</TabsContent>
        </Tabs>
      </Demo>
    ),
  },
  {
    slug: "overlays", title: "Dialog / Popover / Dropdown / Tooltip", group: "Molecules",
    render: () => (
      <Demo title="Overlays" importLine={'import { Dialog, ... } from "@/components/ui/dialog"'}>
        <Dialog>
          <DialogTrigger render={<Button variant="outline">Dialog</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Archive session?</DialogTitle>
              <DialogDescription>The session stays searchable in History.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="ghost">Cancel</Button>} />
              <DialogClose render={<Button>Archive</Button>} />
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Popover>
          <PopoverTrigger render={<Button variant="outline">Popover</Button>} />
          <PopoverContent className="text-sm w-56">Anchored content.</PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline">Menu</Button>} />
          <DropdownMenuContent>
            <DropdownMenuLabel>Session</DropdownMenuLabel>
            <DropdownMenuItem>Rename</DropdownMenuItem>
            <DropdownMenuItem>Duplicate</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger render={<Button variant="outline">Tooltip</Button>} />
            <TooltipContent>Keyboard: ⌘K</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </Demo>
    ),
  },
  {
    slug: "feedback", title: "Progress / Spinner / Skeleton", group: "Atoms",
    render: () => (
      <Demo title="Feedback" importLine={'import { Progress } from "@/components/ui/progress"'}>
        <Progress value={64} className="w-48" />
        <Spinner />
        <Skeleton className="h-8 w-32" />
        <Avatar><AvatarFallback>ST</AvatarFallback></Avatar>
        <Separator orientation="vertical" className="h-8" />
        <Badge variant="outline">64%</Badge>
      </Demo>
    ),
  },
  {
    slug: "extended-atoms", title: "Extended atoms", group: "Atoms", feature: "extended",
    render: () => (
      <Demo title="Button groups, toggles, native select" importLine={'import { ButtonGroup, Toggle, NativeSelect } from "@/components/ui/*"'}>
        <ButtonGroup><Button variant="outline">Back</Button><Button variant="outline">Forward</Button></ButtonGroup>
        <Toggle aria-label="Toggle bold">Bold</Toggle>
        <ToggleGroup defaultValue={["grid"]}><ToggleGroupItem value="list">List</ToggleGroupItem><ToggleGroupItem value="grid">Grid</ToggleGroupItem></ToggleGroup>
        <NativeSelect defaultValue="auto"><NativeSelectOption value="auto">Auto</NativeSelectOption><NativeSelectOption value="fast">Fast</NativeSelectOption></NativeSelect>
      </Demo>
    ),
  },
  {
    slug: "extended-molecules", title: "Extended overlays", group: "Molecules", feature: "extended",
    render: () => (
      <Demo title="Sheet and alert dialog" importLine={'import { Sheet, AlertDialog } from "@/components/ui/*"'}>
        <Sheet><SheetTrigger render={<Button variant="outline">Open sheet</Button>} /><SheetContent><SheetHeader><SheetTitle>Session inspector</SheetTitle><SheetDescription>Edge-docked detail panel.</SheetDescription></SheetHeader></SheetContent></Sheet>
        <AlertDialog><AlertDialogTrigger render={<Button variant="destructive">Delete</Button>} /><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete session?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      </Demo>
    ),
  },
  {
    slug: "session-template", title: "Session workspace", group: "Templates",
    render: () => <div className="rounded-lg border border-border p-4 text-sm"><strong>Template:</strong> Sidebar session navigation + Viewport header + transcript Page + optional right/bottom Panels. Templates compose organisms; they own layout, not data fetching.</div>,
  },
  {
    slug: "page-examples", title: "Page examples", group: "Pages",
    render: () => <div className="grid gap-3 sm:grid-cols-3">{["Sessions / Chat", "Vaults / Editor", "Fleet / Nodes"].map((x) => <Card key={x}><CardHeader><CardTitle className="text-sm">{x}</CardTitle><CardDescription>A route-level page assembled from a View template.</CardDescription></CardHeader></Card>)}</div>,
  },
  {
    slug: "naming", title: "Naming Conventions", group: "Templates",
    render: () => (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <p>Shared vocabulary for the shell. Use these names in code, docs, cards, and reviews — one word per concept.</p>
        <div className="not-prose my-6 rounded-xl border border-border bg-muted/20 p-4" role="img" aria-label="Stellarc shell naming diagram">
          <div className="mb-2 rounded-md border border-border bg-background px-3 py-2 text-center text-xs font-semibold">TopBar · global navigation and search</div>
          <div className="grid min-h-56 grid-cols-[11rem_1fr] gap-2">
            <div className="rounded-md border border-border bg-background p-3">
              <div className="mb-3 text-center text-xs font-semibold">Sidebar</div>
              {["NavItem", "NavItem · active", "NavItem"].map((label, i) => <div key={i} className={cn("mb-2 rounded px-2 py-1 text-[11px]", i === 1 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>{label}</div>)}
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <div className="mb-2 text-center text-xs font-semibold">Viewport</div>
              <div className="mb-2 rounded border border-dashed border-border p-2 text-center text-[11px] text-muted-foreground">View header</div>
              <div className="grid h-32 grid-cols-[1fr_9rem] gap-2">
                <div className="flex items-center justify-center rounded border border-dashed border-border text-[11px] text-muted-foreground">Page content</div>
                <div className="flex items-center justify-center rounded border border-dashed border-border text-[11px] text-muted-foreground">Right Panel</div>
              </div>
              <div className="mt-2 rounded border border-dashed border-border p-2 text-center text-[11px] text-muted-foreground">Bottom Panel</div>
            </div>
          </div>
          <div className="mt-2 text-center text-[10px] uppercase tracking-wide text-muted-foreground">View = Sidebar + Viewport · Surface selects the View</div>
        </div>
        <table>
          <thead><tr><th>Term</th><th>What it is</th><th>Where</th></tr></thead>
          <tbody>
            <tr><td><strong>Surface</strong></td><td>Top-level app area selected in the TopBar nav rail (Sessions, Vaults, Projects, Fleet, Settings, Docs). One route prefix each.</td><td><code>router.ts SurfaceName</code></td></tr>
            <tr><td><strong>View</strong></td><td>The React component owning a surface&apos;s whole area below the TopBar — its Sidebar + Viewport split included.</td><td><code>views/*View.tsx</code></td></tr>
            <tr><td><strong>TopBar</strong></td><td>Global chrome: sidebar toggle, nav rail, search (⌘K), org/profile.</td><td><code>AppShell.tsx</code>, <code>.topbar</code></td></tr>
            <tr><td><strong>Sidebar</strong></td><td>The View-owned left column (session list, vault tree, docs nav). Resizable, collapsible.</td><td><code>.sidebar</code>, <code>ResizableSidebar</code></td></tr>
            <tr><td><strong>NavItem</strong></td><td>One row in a Sidebar: icon + label, hover/active states. Selection is highlight intensity — never left-edge bars.</td><td><code>.navitem</code></td></tr>
            <tr><td><strong>Viewport</strong></td><td>The main content area right of the Sidebar. Owns its own header row.</td><td><code>.viewport</code>, <code>.vp-head</code>/<code>.vp-body</code></td></tr>
            <tr><td><strong>Panel</strong></td><td>A secondary collapsible region inside a Viewport: bottom panel (terminal/logs), right panel (session inspector).</td><td><code>.bp-*</code>, <code>.rs-*</code></td></tr>
            <tr><td><strong>Page</strong></td><td>A NavItem-selected screen inside a View that swaps the Viewport content (Agents, Usage, History).</td><td><code>SessionsPage</code> type</td></tr>
            <tr><td><strong>Cockpit</strong></td><td>The floating operator tool cluster mounted at app root; persists across every Surface.</td><td><code>cockpit/</code></td></tr>
            <tr><td><strong>Popover / Dialog / Sheet</strong></td><td>Overlays, in escalating weight: anchored popover → modal dialog → edge-docked sheet.</td><td><code>components/ui</code></td></tr>
          </tbody>
        </table>
      </div>
    ),
  },
  {
    slug: "charts", title: "Charts", group: "Organisms",
    render: () => (
      <Demo title="TanStack Charts" importLine={'import { Chart } from "@tanstack/react-charts"'}>
        <div className="w-full min-w-0">
          <TanStackChartDemo />
          <p className="mt-3 text-xs text-muted-foreground">Typed TanStack chart definition; keyboard focus and tooltip enabled; colors use design tokens.</p>
        </div>
      </Demo>
    ),
  },
];

function DesignSystemPage({ scrollRef, active, extended, onExtendedChange }: {
  scrollRef: React.RefObject<HTMLElement | null>;
  active: string;
  extended: boolean;
  onExtendedChange: (value: boolean) => void;
}) {
  void active;
  void scrollRef;
  const visible = SECTIONS.filter((sec) => !sec.feature || extended);
  return (
    <>
      <div className="mb-10 flex items-center justify-between rounded-lg border border-border bg-muted/20 p-4">
        <div><div className="text-sm font-medium">Extended component catalog</div><div className="text-xs text-muted-foreground">Show optional primitives and experimental compositions.</div></div>
        <Switch checked={extended} onCheckedChange={onExtendedChange} aria-label="Show extended component catalog" />
      </div>
      {visible.map((sec) => (
        <section key={sec.slug} id={`docs-${sec.slug}`} className="mb-16 scroll-mt-4">
          <h1 className="mb-6 text-xl font-semibold border-b border-border pb-2">{sec.title}</h1>
          {sec.render()}
        </section>
      ))}
    </>
  );
}


// Floating in-viewport TOC (ucollect-nexus /dev pattern): fixed card at the
// right edge of the Viewport, tracks the active section, instant jumps.
function FloatingTOC({ scrollRef, active, onJump, extended }: {
  scrollRef: React.RefObject<HTMLElement | null>;
  active: string;
  onJump: (slug: string) => void;
  extended: boolean;
}) {
  void scrollRef;
  const groups = (() => {
    const order = ["Foundations", "Atoms", "Molecules", "Organisms", "Templates", "Pages"];
    const byGroup = new Map<string, Section[]>();
    for (const s of SECTIONS.filter((sec) => !sec.feature || extended)) {
      byGroup.set(s.group, [...(byGroup.get(s.group) ?? []), s]);
    }
    return order.flatMap((group) => {
      const sections = byGroup.get(group);
      return sections ? [{ group, sections }] : [];
    });
  })();
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-56 xl:block">
      <div className="pointer-events-auto sticky top-6 mr-4 mt-6 max-h-[calc(100vh-9rem)] overflow-y-auto rounded-lg border border-border bg-background/85 p-3 backdrop-blur">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">On this page</p>
        <nav className="space-y-px">
          {groups.map(({ group, sections }) => (
            <div key={group}>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 first:mt-0">{group}</p>
              {sections.map((s) => (
                <a
                  key={s.slug}
                  href={`/docs/${s.slug}`}
                  onClick={(e) => { e.preventDefault(); onJump(s.slug); }}
                  className={cn(
                    "block border-l py-0.5 pl-2 text-[11px] leading-tight transition-colors",
                    s.slug === active
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.title}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}

// ── Pages (sidebar = page select) ────────────────────────────────
const PAGE_DEFS = [
  { slug: "design-system", title: "Design System" },
  { slug: "guidelines", title: "Guidelines" },
  { slug: "themes", title: "Themes" },
] as const;
type PageSlug = (typeof PAGE_DEFS)[number]["slug"];

const SECTION_SLUGS = new Set(SECTIONS.map((s) => s.slug));

export function DocsView() {
  const scrollRef = useRef<HTMLElement | null>(null);
  const urlTail = window.location.pathname.split("/docs/")[1] ?? "";
  const initialPage: PageSlug =
    urlTail === "guidelines" ? "guidelines" : urlTail === "themes" ? "themes" : "design-system";
  const [page, setPage] = useState<PageSlug>(initialPage);
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].slug);
  const [extended, setExtended] = useState(false);

  // Track active section while scrolling the design-system page.
  useEffect(() => {
    if (page !== "design-system") return;
    const rootEl = scrollRef.current;
    if (!rootEl) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSection(visible[0].target.id.replace(/^docs-/, ""));
      },
      { root: rootEl, rootMargin: "0px 0px -70% 0px" },
    );
    for (const sec of SECTIONS) {
      const el = rootEl.querySelector(`#docs-${CSS.escape(sec.slug)}`);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [page]);

  // Deep link: /docs/<section-slug> lands on that section of the design-system page.
  useEffect(() => {
    if (SECTION_SLUGS.has(urlTail)) {
      const el = scrollRef.current?.querySelector(`#docs-${CSS.escape(urlTail)}`);
      el?.scrollIntoView({ block: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jumpToSection = (slug: string) => {
    if (page !== "design-system") setPage("design-system");
    // instant jump — smooth-scrolling a page this tall is painfully slow
    requestAnimationFrame(() => {
      const el = scrollRef.current?.querySelector(`#docs-${CSS.escape(slug)}`);
      el?.scrollIntoView({ block: "start" });
    });
    window.history.replaceState(null, "", `/docs/${slug}`);
  };

  const selectPage = (slug: PageSlug) => {
    setPage(slug);
    scrollRef.current?.scrollTo({ top: 0 });
    window.history.replaceState(null, "", slug === "design-system" ? "/docs" : `/docs/${slug}`);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <nav className="sidebar w-52 shrink-0 overflow-y-auto border-r border-border p-2" aria-label="Docs">
        {PAGE_DEFS.map((p) => (
          <button
            key={p.slug}
            type="button"
            onClick={() => selectPage(p.slug)}
            className={`navitem${page === p.slug ? " on" : ""}`}
            aria-current={page === p.slug ? "page" : undefined}
          >
            {p.title}
          </button>
        ))}
      </nav>
      <div className="relative flex min-w-0 flex-1">
        <main ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto p-8 xl:pr-60">
          {page === "design-system" && <DesignSystemPage scrollRef={scrollRef} active={activeSection} extended={extended} onExtendedChange={setExtended} />}
          {page === "guidelines" && (
            <>
              <h1 className="mb-6 text-xl font-semibold border-b border-border pb-2">Guidelines</h1>
              <GuidelinesPage />
            </>
          )}
          {page === "themes" && (
            <>
              <h1 className="mb-6 text-xl font-semibold border-b border-border pb-2">Themes</h1>
              <ThemesPage />
            </>
          )}
        </main>
        {page === "design-system" && (
          <FloatingTOC scrollRef={scrollRef} active={activeSection} onJump={jumpToSection} extended={extended} />
        )}
      </div>
    </div>
  );
}
