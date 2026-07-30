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
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut } from "@/components/ui/command";
import { Field, FieldLabel, FieldDescription, FieldGroup } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ComponentPlayground as Playground } from "./playgrounds/ComponentPlayground";
import { ControlRow } from "./playgrounds/controls";
import { Accessibility } from "./foundations/Accessibility";
import { Icons } from "./foundations/Icons";
import { Motion } from "./foundations/Motion";
import { Naming } from "./foundations/Naming";
import { Radius } from "./foundations/Radius";
import { Spacing } from "./foundations/Spacing";
import { Themes } from "./foundations/Themes";
import { Typography } from "./foundations/Typography";
import { ProgressPlayground } from "./playgrounds/atoms/ProgressPlayground";
import { SpinnerPlayground } from "./playgrounds/atoms/SpinnerPlayground";
import { SkeletonPlayground } from "./playgrounds/atoms/SkeletonPlayground";
import { ChoiceAtomsPlayground, NativeSelectPlayground, RadioGroupPlayground, SliderPlayground, TextFieldsPlayground } from "./playgrounds/atoms/FormAtomsPlaygrounds";
import { AvatarPlayground, BadgePlayground as AtomBadgePlayground, KbdPlayground, LayoutAtomsPlayground } from "./playgrounds/atoms/IdentityLayoutPlaygrounds";
import { ContentPlaygrounds, DisclosurePlaygrounds, NavigationPlaygrounds, SelectFamilyPlayground } from "./playgrounds/molecules/MoleculePlaygrounds";
import { OverlayPlaygrounds } from "./playgrounds/molecules/OverlayPlaygrounds";
import { CommandSelectorPlaygrounds, DataTablePlayground, StatusNotificationPlaygrounds } from "./playgrounds/organisms/OrganismPlaygrounds";

const SELECT_OPTIONS = ["Hermes", "Claude Code", "Codex", "Gemini", "OpenCode", "Aider", "Goose", "Amp"];
type SelectMode = "select" | "native" | "searchable" | "multiple";

function SelectPlayground() {
  const [mode, setMode] = useState<SelectMode>("select");
  const [disabled, setDisabled] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(["Hermes"]);
  const options = scrolling ? SELECT_OPTIONS : SELECT_OPTIONS.slice(0, 3);
  const filtered = options.filter((option) => option.toLowerCase().includes(query.toLowerCase()));

  const preview = mode === "native" ? (
    <NativeSelect disabled={disabled} defaultValue="Hermes" className="w-52">
      {options.map((option) => <NativeSelectOption key={option} value={option}>{option}</NativeSelectOption>)}
    </NativeSelect>
  ) : mode === "searchable" ? (
    <Command className="w-72 rounded-lg border" aria-disabled={disabled}>
      <CommandInput placeholder="Search agents…" value={query} onValueChange={setQuery} disabled={disabled} />
      <CommandList className={cn(!scrolling && "max-h-32")}>
        <CommandEmpty>No agents found.</CommandEmpty>
        <CommandGroup>{filtered.map((option) => <CommandItem key={option} disabled={disabled} onSelect={() => setSelected([option])}>{option}{selected.includes(option) && <CommandShortcut>Selected</CommandShortcut>}</CommandItem>)}</CommandGroup>
      </CommandList>
    </Command>
  ) : mode === "multiple" ? (
    <div className="w-72 space-y-3">
      <div className="flex min-h-8 flex-wrap gap-1 rounded-lg border border-input p-1.5">
        {selected.length ? selected.map((option) => <Badge key={option} variant="secondary">{option}</Badge>) : <span className="text-sm text-muted-foreground">Select agents…</span>}
      </div>
      <ScrollArea className={cn("rounded-lg border", scrolling ? "h-40" : "h-28")}>
        <div className="p-1">{options.map((option) => <Button key={option} type="button" variant="ghost" size="sm" disabled={disabled} className="w-full justify-start" onClick={() => setSelected((current) => current.includes(option) ? current.filter((item) => item !== option) : [...current, option])}><Checkbox checked={selected.includes(option)} />{option}</Button>)}</div>
      </ScrollArea>
    </div>
  ) : (
    <Select defaultValue="Hermes" disabled={disabled}>
      <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <Playground title="Select" importLine={'import { Select } from "@/components/ui/select"'} controls={<>
      <ControlRow label="Type"><NativeSelect value={mode} onChange={(event) => setMode(event.target.value as SelectMode)}><NativeSelectOption value="select">Select</NativeSelectOption><NativeSelectOption value="native">Native</NativeSelectOption><NativeSelectOption value="searchable">Searchable</NativeSelectOption><NativeSelectOption value="multiple">Multiple</NativeSelectOption></NativeSelect></ControlRow>
      <ControlRow label="Disabled"><Switch checked={disabled} onCheckedChange={setDisabled} /></ControlRow>
      <ControlRow label="Scrolling"><Switch checked={scrolling} onCheckedChange={setScrolling} /></ControlRow>
      {(mode === "searchable" || mode === "multiple") && <ControlRow label="Selection"><span className="max-w-36 truncate text-xs font-mono">{selected.join(", ") || "none"}</span></ControlRow>}
    </>}>
      {preview}
    </Playground>
  );
}

function ButtonPlayground({ kind }: { kind: "variants" | "sizes" }) {
  const [disabled, setDisabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState(kind === "variants" ? "Action" : "Button");
  return (
    <Playground title={kind === "variants" ? "Variants" : "Sizes"} importLine={'import { Button } from "@/components/ui/button"'} controls={<>
      <ControlRow label="Disabled"><Switch checked={disabled} onCheckedChange={setDisabled} /></ControlRow>
      <ControlRow label="Loading"><Switch checked={loading} onCheckedChange={setLoading} /></ControlRow>
      <ControlRow label="Label"><Input className="h-7 w-28 text-xs" value={label} onChange={(event) => setLabel(event.target.value)} /></ControlRow>
    </>}>
      {kind === "variants" ? (["default", "secondary", "outline", "ghost", "destructive", "link"] as const).map((variant) => <Button key={variant} variant={variant} disabled={disabled}>{loading && variant === "default" ? <Spinner /> : label || variant}</Button>) : (["xs", "sm", "default", "lg"] as const).map((size) => <Button key={size} variant="outline" size={size} disabled={disabled}>{loading && size === "default" ? <Spinner /> : label}</Button>)}
    </Playground>
  );
}

function BadgePlayground() {
  const [variant, setVariant] = useState<"default" | "secondary" | "outline" | "destructive">("default");
  const [label, setLabel] = useState("Status");
  return <Playground title="Badge" importLine={'import { Badge } from "@/components/ui/badge"'} controls={<><ControlRow label="Variant"><NativeSelect value={variant} onChange={(event) => setVariant(event.target.value as typeof variant)}>{["default","secondary","outline","destructive"].map((v)=><NativeSelectOption key={v} value={v}>{v}</NativeSelectOption>)}</NativeSelect></ControlRow><ControlRow label="Label"><Input className="h-7 w-28 text-xs" value={label} onChange={(event)=>setLabel(event.target.value)} /></ControlRow></>}><Badge variant={variant}>{label}</Badge></Playground>;
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
    slug: "naming", title: "Naming Conventions", group: "Foundations",
    render: () => <Naming />,
  },
  {
    slug: "colors", title: "Themes & Colors", group: "Foundations",
    render: () => <Themes />,
  },
  {
    slug: "typography", title: "Typography", group: "Foundations",
    render: () => <Typography />,
  },
  {
    slug: "spacing", title: "Spacing", group: "Foundations",
    render: () => <Spacing />,
  },
  {
    slug: "radius", title: "Radius", group: "Foundations",
    render: () => <Radius />,
  },
  {
    slug: "motion", title: "Motion", group: "Foundations",
    render: () => <Motion />,
  },
  {
    slug: "icons", title: "Icons", group: "Foundations",
    render: () => <Icons />,
  },
  {
    slug: "accessibility", title: "Accessibility", group: "Foundations",
    render: () => <Accessibility />,
  },
  {
    slug: "buttons", title: "Button", group: "Atoms",
    render: () => (
      <><ButtonPlayground kind="variants" /><ButtonPlayground kind="sizes" /></>
    ),
  },
  { slug: "badge", title: "Badge", group: "Atoms", render: () => <AtomBadgePlayground /> },
  { slug: "avatar", title: "Avatar", group: "Atoms", render: () => <AvatarPlayground /> },
  {
    slug: "card", title: "Card", group: "Molecules",
    render: () => (
      <Playground title="Card" importLine={'import { Card, CardHeader, ... } from "@/components/ui/card"'}>
        <Card className="w-72">
          <CardHeader>
            <CardTitle>Node fxcompute-01</CardTitle>
            <CardDescription>2 agents · online</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">Last heartbeat 12s ago.</CardContent>
          <CardFooter><Button size="sm" variant="outline">Inspect</Button></CardFooter>
        </Card>
      </Playground>
    ),
  },
  { slug: "inputs", title: "Input / Textarea / Label", group: "Atoms", render: () => <TextFieldsPlayground /> },
  { slug: "native-select", title: "Native Select", group: "Atoms", render: () => <NativeSelectPlayground /> },
  { slug: "radio-group", title: "Radio Group", group: "Atoms", render: () => <RadioGroupPlayground /> },
  { slug: "slider", title: "Slider", group: "Atoms", render: () => <SliderPlayground /> },
  {
    slug: "select", title: "Select", group: "Molecules",
    render: () => <SelectFamilyPlayground />,
  },
  { slug: "toggles", title: "Checkbox / Switch / Toggle", group: "Atoms", render: () => <ChoiceAtomsPlayground /> },
  { slug: "disclosure", title: "Accordion / Collapsible", group: "Molecules", render: () => <DisclosurePlaygrounds /> },
  { slug: "navigation", title: "Tabs / Breadcrumb / Pagination", group: "Molecules", render: () => <NavigationPlaygrounds /> },
  { slug: "overlays", title: "Overlay family", group: "Molecules", render: () => <OverlayPlaygrounds /> },
  { slug: "content-molecules", title: "Alert / Empty / Table / Scroll Area", group: "Molecules", render: () => <ContentPlaygrounds /> },
  { slug: "progress", title: "Progress", group: "Atoms", render: () => <ProgressPlayground /> },
  { slug: "spinner", title: "Spinner", group: "Atoms", render: () => <SpinnerPlayground /> },
  { slug: "skeleton", title: "Skeleton", group: "Atoms", render: () => <SkeletonPlayground /> },
  {
    slug: "field-input-group", title: "Field / Input Group", group: "Molecules",
    render: () => (
      <Playground title="Structured fields" importLine={'import { Field, InputGroup } from "@/components/ui/*"'}>
        <FieldGroup className="w-80"><Field><FieldLabel htmlFor="agent-filter">Agent filter</FieldLabel><InputGroup><InputGroupAddon><InputGroupText>agent:</InputGroupText></InputGroupAddon><InputGroupInput id="agent-filter" placeholder="default" /></InputGroup><FieldDescription>Prefix and input remain one accessible field.</FieldDescription></Field></FieldGroup>
      </Playground>
    ),
  },
  {
    slug: "command", title: "Command", group: "Organisms",
    render: () => <CommandSelectorPlaygrounds />,
  },
  { slug: "data-table", title: "Data Table", group: "Organisms", render: () => <DataTablePlayground /> },
  { slug: "status-notifications", title: "Status & Notifications", group: "Organisms", render: () => <StatusNotificationPlaygrounds /> },
  { slug: "layout-atoms", title: "Marker / Separator / Aspect Ratio", group: "Atoms", render: () => <LayoutAtomsPlayground /> },
  { slug: "kbd", title: "Keyboard Key", group: "Atoms", render: () => <KbdPlayground /> },
  {
    slug: "extended-atoms", title: "Extended atoms", group: "Atoms", feature: "extended",
    render: () => (
      <Playground title="Button groups, toggles, native select" importLine={'import { ButtonGroup, Toggle, NativeSelect } from "@/components/ui/*"'}>
        <ButtonGroup><Button variant="outline">Back</Button><Button variant="outline">Forward</Button></ButtonGroup>
        <Toggle aria-label="Toggle bold">Bold</Toggle>
        <ToggleGroup defaultValue={["grid"]}><ToggleGroupItem value="list">List</ToggleGroupItem><ToggleGroupItem value="grid">Grid</ToggleGroupItem></ToggleGroup>
        <NativeSelect defaultValue="auto"><NativeSelectOption value="auto">Auto</NativeSelectOption><NativeSelectOption value="fast">Fast</NativeSelectOption></NativeSelect>
      </Playground>
    ),
  },
  {
    slug: "extended-molecules", title: "Extended overlays", group: "Molecules", feature: "extended",
    render: () => (
      <Playground title="Sheet and alert dialog" importLine={'import { Sheet, AlertDialog } from "@/components/ui/*"'}>
        <Sheet><SheetTrigger render={<Button variant="outline">Open sheet</Button>} /><SheetContent><SheetHeader><SheetTitle>Session inspector</SheetTitle><SheetDescription>Edge-docked detail panel.</SheetDescription></SheetHeader></SheetContent></Sheet>
        <AlertDialog><AlertDialogTrigger render={<Button variant="destructive">Delete</Button>} /><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete session?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      </Playground>
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
    slug: "charts", title: "Charts", group: "Organisms",
    render: () => <TanStackChartDemo />,
  },
];

const SECTION_GROUP_ORDER = ["Foundations", "Atoms", "Molecules", "Organisms", "Templates", "Pages"] as const;
function orderedSections(extended: boolean) {
  return SECTION_GROUP_ORDER.flatMap((group) =>
    SECTIONS.filter((section) => section.group === group && (!section.feature || extended)),
  );
}

function DesignSystemPage({ scrollRef, active, extended, onExtendedChange }: {
  scrollRef: React.RefObject<HTMLElement | null>;
  active: string;
  extended: boolean;
  onExtendedChange: (value: boolean) => void;
}) {
  void active;
  void scrollRef;
  const visible = orderedSections(extended);
  return (
    <>
      <div className="mb-10 flex items-center justify-between rounded-lg border border-border bg-muted/20 p-4">
        <div><div className="text-sm font-medium">Extended catalog</div><div className="text-xs text-muted-foreground">Show optional and experimental component playgrounds.</div></div>
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
  const groups = SECTION_GROUP_ORDER.map((group) => ({
    group,
    sections: orderedSections(extended).filter((section) => section.group === group),
  })).filter(({ sections }) => sections.length > 0);
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
    for (const sec of orderedSections(extended)) {
      const el = rootEl.querySelector(`#docs-${CSS.escape(sec.slug)}`);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [page, extended]);

  // Deep link: /docs/<section-slug> lands on that section of the design-system page.
  useEffect(() => {
    if (SECTION_SLUGS.has(urlTail)) {
      const el = scrollRef.current?.querySelector(`#docs-${CSS.escape(urlTail)}`);
      if (el && scrollRef.current) scrollRef.current.scrollTop = (el as HTMLElement).offsetTop;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jumpToSection = (slug: string) => {
    if (page !== "design-system") setPage("design-system");
    // instant jump — smooth-scrolling a page this tall is painfully slow
    requestAnimationFrame(() => {
      const el = scrollRef.current?.querySelector(`#docs-${CSS.escape(slug)}`);
      if (el && scrollRef.current) scrollRef.current.scrollTop = (el as HTMLElement).offsetTop;
    });
    window.history.replaceState(null, "", `/docs/${slug}`);
  };

  const selectPage = (slug: PageSlug) => {
    setPage(slug);
    scrollRef.current?.scrollTo({ top: 0 });
    window.history.replaceState(null, "", slug === "design-system" ? "/docs" : `/docs/${slug}`);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
      <nav className="docs-sidebar flex w-full shrink-0 overflow-x-auto border-b border-border p-1 sm:block sm:w-52 sm:overflow-y-auto sm:border-b-0 sm:border-r sm:p-2" aria-label="Docs">
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
      <div className="relative flex min-h-0 min-w-0 flex-1">
        <main ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto p-3 pb-20 sm:p-8 sm:pb-20 xl:pr-60">
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
              <Themes />
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
