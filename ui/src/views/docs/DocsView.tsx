// ── /docs — design system reference ─────────────────────────────
// Shadcn-style living docs: token swatches read from the LIVE CSS custom
// properties (no duplicated values), plus one demo per ui/ component.
// This page is the uniformization contract for plugin authors.
import { useEffect, useMemo, useRef, useState } from "react";
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
  if (!value) return null; // token absent in this theme — skip silently
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

// ── Demo scaffolding ─────────────────────────────────────────────
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

// ── Pages ────────────────────────────────────────────────────────
type Page = { slug: string; title: string; group: string; render: () => React.ReactNode };

const PAGES: Page[] = [
  {
    slug: "overview", title: "Overview", group: "Foundations",
    render: () => (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <h2>Stellarc Design System</h2>
        <p>
          Every Stellarc surface — core UI and plugins alike — builds from the same three layers:
        </p>
        <ol>
          <li><strong>Tokens</strong> (<code>ui/src/design/tokens/*.css</code>) — colors, type, spacing, radius, motion. Both themes. Never hardcode a hex.</li>
          <li><strong>Primitives</strong> (<code>ui/src/components/ui/*</code>) — base-ui behavior + cva variants + Tailwind styling. Import these; do not re-implement buttons.</li>
          <li><strong>Patterns</strong> — composition rules in the Guidelines page (row highlight ladder, resizable sidebars, tab semantics).</li>
        </ol>
        <p>
          Plugin rule: a plugin ships <em>no palette of its own</em>. It consumes tokens and primitives from this page.
          A visual need not covered here is a design-system change first, a plugin change second.
        </p>
      </div>
    ),
  },
  {
    slug: "colors", title: "Colors", group: "Foundations",
    render: () => (
      <div>
        <p className="text-sm text-muted-foreground mb-4">Live values from the active theme. Toggle the theme in the top bar to see the other block.</p>
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
    slug: "buttons", title: "Button", group: "Components",
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
    slug: "badge", title: "Badge", group: "Components",
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
    slug: "card", title: "Card", group: "Components",
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
    slug: "inputs", title: "Input / Textarea", group: "Components",
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
    slug: "select", title: "Select", group: "Components",
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
    slug: "toggles", title: "Checkbox / Switch", group: "Components",
    render: () => (
      <Demo title="Toggles" importLine={'import { Checkbox } from "@/components/ui/checkbox"'}>
        <label className="flex items-center gap-2 text-sm"><Checkbox defaultChecked /> Auto-archive</label>
        <label className="flex items-center gap-2 text-sm"><Switch defaultChecked /> Live updates</label>
      </Demo>
    ),
  },
  {
    slug: "tabs", title: "Tabs", group: "Components",
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
    slug: "overlays", title: "Dialog / Popover / Dropdown / Tooltip", group: "Components",
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
    slug: "feedback", title: "Progress / Spinner / Skeleton", group: "Components",
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
    slug: "charts", title: "Charts", group: "Components",
    render: () => (
      <div className="text-sm space-y-3 max-w-prose">
        <p><Badge variant="outline">Not yet shipped</Badge></p>
        <p>
          No chart library is installed. When the first data-viz feature lands, charts adopt the same
          contract as every component here: series colors, grid lines, and axis text come from tokens
          (<code>--accent</code>, <code>--border-faint</code>, <code>--text-dim</code>), never a library default palette.
        </p>
      </div>
    ),
  },
  {
    slug: "guidelines", title: "Guidelines (full spec)", group: "Patterns",
    render: () => <GuidelinesPage />,
  },
];

function GuidelinesPage() {
  const [md, setMd] = useState<string>("Loading…");
  useEffect(() => {
    // dynamic so router/shell tests never transform the raw file
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

// ── View ─────────────────────────────────────────────────────────
// Single scrollable page (ucollect-nexus dev-docs pattern): all sections
// stacked, left TOC jumps via scrollIntoView, IntersectionObserver tracks
// the active section for highlight.
export function DocsView() {
  const scrollRef = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState<string>(PAGES[0].slug);

  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, Page[]>();
    for (const p of PAGES) {
      if (!byGroup.has(p.group)) { byGroup.set(p.group, []); order.push(p.group); }
      byGroup.get(p.group)!.push(p);
    }
    return order.map((g) => ({ group: g, pages: byGroup.get(g)! }));
  }, []);

  useEffect(() => {
    const rootEl = scrollRef.current;
    if (!rootEl) return;
    const obs = new IntersectionObserver(
      (entries) => {
        // topmost visible section wins
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id.replace(/^docs-/, ""));
      },
      { root: rootEl, rootMargin: "0px 0px -70% 0px" },
    );
    for (const pg of PAGES) {
      const el = rootEl.querySelector(`#docs-${CSS.escape(pg.slug)}`);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, []);

  // deep link: /docs/<slug> scrolls to that section on mount
  useEffect(() => {
    const slug = window.location.pathname.split("/docs/")[1];
    if (!slug) return;
    const el = scrollRef.current?.querySelector(`#docs-${CSS.escape(slug)}`);
    el?.scrollIntoView({ block: "start" });
  }, []);

  const jump = (slug: string) => {
    const el = scrollRef.current?.querySelector(`#docs-${CSS.escape(slug)}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `/docs/${slug}`);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <nav className="w-56 shrink-0 overflow-y-auto border-r border-border p-3" aria-label="Docs">
        {groups.map(({ group, pages }) => (
          <div key={group} className="mb-4">
            <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</div>
            {pages.map((p) => (
              <button
                key={p.slug}
                type="button"
                onClick={() => jump(p.slug)}
                className={cn(
                  "block w-full rounded-md px-2 py-1 text-left text-sm hover:bg-muted",
                  p.slug === active && "bg-muted font-medium",
                )}
                aria-current={p.slug === active ? "location" : undefined}
              >
                {p.title}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <main ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto scroll-smooth p-8">
        {PAGES.map((pg) => (
          <section key={pg.slug} id={`docs-${pg.slug}`} className="mb-16 scroll-mt-4">
            <h1 className="mb-6 text-xl font-semibold border-b border-border pb-2">{pg.title}</h1>
            {pg.render()}
          </section>
        ))}
      </main>
    </div>
  );
}
