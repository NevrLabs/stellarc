import { useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, File, Image, Menu, Paperclip, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { ComponentPlayground } from "../ComponentPlayground";
import { ControlRow } from "../controls";

const select = <T extends string>(label: string, value: T, set: (value: T) => void, values: readonly T[]) => <NativeSelect aria-label={label} value={value} onChange={(event) => set(event.target.value as T)}>{values.map((item) => <NativeSelectOption key={item}>{item}</NativeSelectOption>)}</NativeSelect>;
const Block = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="min-w-0 rounded-lg border bg-background p-3"><h4 className="mb-3 text-sm font-semibold">{title}</h4>{children}</section>;

export function RemainingComponentsPlayground() {
  const [rtl, setRtl] = useState(false);
  const [otpLength, setOtpLength] = useState<"4" | "6" | "8">("6");
  const [otpPattern, setOtpPattern] = useState<"numeric" | "alphanumeric">("numeric");
  const [otp, setOtp] = useState("");
  const [otpDisabled, setOtpDisabled] = useState(false);
  const [otpInvalid, setOtpInvalid] = useState(false);
  const [toastTone, setToastTone] = useState<"info" | "success" | "warning" | "error">("info");
  const [toastDuration, setToastDuration] = useState("5000");
  const [toastDismissible, setToastDismissible] = useState(true);
  const [toastVisible, setToastVisible] = useState(true);
  const [fileType, setFileType] = useState<"image" | "doc" | "code">("image");
  const [progress, setProgress] = useState(64);
  const [removable, setRemovable] = useState(true);
  const [role, setRole] = useState<"user" | "assistant">("assistant");
  const [streaming, setStreaming] = useState(false);
  const [messageFrom, setMessageFrom] = useState<"user" | "assistant" | "system">("assistant");
  const [contentType, setContentType] = useState<"text" | "markdown" | "code">("markdown");
  const [calendarMode, setCalendarMode] = useState<"single" | "range">("single");
  const [locale, setLocale] = useState<"en-US" | "de-DE" | "ja-JP">("en-US");
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const [slide, setSlide] = useState(1);
  const [slides, setSlides] = useState(3);
  const [loop, setLoop] = useState(true);
  const [autoplay, setAutoplay] = useState(false);
  const [checked, setChecked] = useState(true);
  const [radio, setRadio] = useState("Balanced");
  const [resizeOrientation, setResizeOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const [collapsed, setCollapsed] = useState(false);
  const [persist, setPersist] = useState(false);
  const [follow, setFollow] = useState(true);
  const [paused, setPaused] = useState(false);
  const [itemSize, setItemSize] = useState<"sm" | "md" | "lg">("md");
  const [selected, setSelected] = useState(true);
  const [itemDisabled, setItemDisabled] = useState(false);
  const [formState, setFormState] = useState<"valid" | "invalid" | "server error">("valid");
  const [pending, setPending] = useState(false);
  const [active, setActive] = useState("Docs");
  const [mobile, setMobile] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const move = (delta: number) => setSlide((current) => loop ? (current - 1 + delta + slides) % slides + 1 : Math.min(slides, Math.max(1, current + delta)));
  const FileIcon = fileType === "image" ? Image : fileType === "code" ? File : Paperclip;
  const tone = { info: "border-blue-500", success: "border-green-500", warning: "border-yellow-500", error: "border-destructive" }[toastTone];
  return <ComponentPlayground title="Remaining components" importLine="Native HTML and existing primitives — no new wrappers" controls={<><ControlRow label="Direction"><Switch aria-label="RTL direction" checked={rtl} onCheckedChange={setRtl} /></ControlRow><ControlRow label="Mobile fallback"><Switch aria-label="Mobile fallback" checked={mobile} onCheckedChange={setMobile} /></ControlRow></>}>
    <div className="grid w-full min-w-0 gap-3 lg:grid-cols-2">
      <Block title="Direction"><div dir={rtl ? "rtl" : "ltr"} className="rounded bg-muted p-3 text-sm" data-testid="direction-preview">{rtl ? "RTL: مرحبا بالعالم" : "LTR: Hello world"}</div></Block>
      <Block title="Input OTP"><div className="space-y-2"><div className="flex gap-2">{select("OTP length", otpLength, setOtpLength, ["4", "6", "8"])}{select("OTP pattern", otpPattern, setOtpPattern, ["numeric", "alphanumeric"])}</div><Input aria-label="One-time password" value={otp} onChange={(e) => setOtp(e.target.value.slice(0, Number(otpLength)).replace(otpPattern === "numeric" ? /\D/g : /[^a-z0-9]/gi, ""))} maxLength={Number(otpLength)} inputMode={otpPattern === "numeric" ? "numeric" : "text"} disabled={otpDisabled} aria-invalid={otpInvalid} placeholder={`${otpLength}-character code`} /><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setOtp("12345678".slice(0, Number(otpLength)))}>Paste sample</Button><label className="text-xs"><input type="checkbox" checked={otpDisabled} onChange={(e) => setOtpDisabled(e.target.checked)} /> disabled</label><label className="text-xs"><input type="checkbox" checked={otpInvalid} onChange={(e) => setOtpInvalid(e.target.checked)} /> invalid</label></div></div></Block>
      <Block title="Toast"><div className="space-y-2">{toastVisible && <div role="status" className={`flex items-center gap-2 rounded border-l-4 p-2 text-sm ${tone}`}><span className="flex-1">{toastTone}: Build finished ({toastDuration}ms)</span><Button size="sm" variant="ghost">View</Button>{toastDismissible && <Button aria-label="Dismiss toast" size="icon-sm" variant="ghost" onClick={() => setToastVisible(false)}>×</Button>}</div>}<div className="flex gap-2">{select("Toast tone", toastTone, setToastTone, ["info", "success", "warning", "error"])}<Input aria-label="Toast duration" type="number" value={toastDuration} onChange={(e) => setToastDuration(e.target.value)} /><Button size="sm" onClick={() => setToastVisible(true)}>Show</Button></div><label className="text-xs"><input type="checkbox" checked={toastDismissible} onChange={(e) => setToastDismissible(e.target.checked)} /> dismissible</label></div></Block>
      <Block title="Attachment"><div className="space-y-2"><div className="flex items-center gap-2 rounded border p-2"><FileIcon className="size-5"/><div className="min-w-0 flex-1 text-sm"><div>design-system.{fileType === "image" ? "png" : fileType === "code" ? "tsx" : "pdf"}</div><div className="text-xs text-muted-foreground">2.4 MB</div><Progress value={progress} /></div>{removable && <Button aria-label="Remove attachment" size="icon-sm" variant="ghost"><Trash2 /></Button>}</div><div className="flex gap-2">{select("File type", fileType, setFileType, ["image", "doc", "code"])}<input aria-label="Upload progress" type="range" min="0" max="100" value={progress} onChange={(e) => setProgress(Number(e.target.value))}/></div><label className="text-xs"><input type="checkbox" checked={removable} onChange={(e) => setRemovable(e.target.checked)} /> removable</label></div></Block>
      <Block title="Bubble"><div className="space-y-2">{select("Bubble role", role, setRole, ["user", "assistant"])}<div className={`flex ${role === "user" ? "justify-end" : "justify-start"}`}><div className="max-w-xs rounded-xl bg-muted p-3 text-sm">{streaming ? "Generating response… ▍" : "Response complete"}<div className="mt-1 text-[10px] text-muted-foreground">{streaming ? "streaming" : "delivered"}</div></div></div><label className="text-xs"><input type="checkbox" checked={streaming} onChange={(e) => setStreaming(e.target.checked)} /> streaming</label></div></Block>
      <Block title="Message"><div className="space-y-2"><div className="flex gap-2">{select("Message from", messageFrom, setMessageFrom, ["user", "assistant", "system"])}{select("Content type", contentType, setContentType, ["text", "markdown", "code"])}</div><article className="rounded border p-3 text-sm"><strong>{messageFrom}</strong><pre className="mt-1 whitespace-pre-wrap">{contentType === "code" ? "const ready = true;" : contentType === "markdown" ? "**Ready** to deploy." : "Ready to deploy."}</pre><div className="mt-2 flex gap-1"><Button size="sm" variant="ghost">Copy</Button><Button size="sm" variant="ghost">Retry</Button></div></article></div></Block>
      <Block title="Calendar"><div className="space-y-2"><div className="flex gap-2">{select("Calendar selection", calendarMode, setCalendarMode, ["single", "range"])}{select("Calendar locale", locale, setLocale, ["en-US", "de-DE", "ja-JP"])}</div><div className="flex gap-2"><input aria-label="Start date" type="date" lang={locale} min="2026-08-01" />{calendarMode === "range" && <input aria-label="End date" type="date" lang={locale} min="2026-08-01" />}</div><p className="text-xs text-muted-foreground">Dates before Aug 1 are disabled · {locale}</p></div></Block>
      <Block title="Carousel"><div className="space-y-2"><div className="flex gap-2">{select("Carousel orientation", orientation, setOrientation, ["horizontal", "vertical"])}<Input aria-label="Slide count" type="number" min="1" max="8" value={slides} onChange={(e) => { setSlides(Math.max(1, Number(e.target.value))); setSlide(1); }} /></div><div className={`flex items-center gap-2 ${orientation === "vertical" ? "flex-col" : ""}`}><Button aria-label="Previous slide" size="icon-sm" variant="outline" onClick={() => move(-1)}><ChevronLeft/></Button><div className="grid h-20 flex-1 place-items-center rounded bg-muted">Slide {slide} / {slides}</div><Button aria-label="Next slide" size="icon-sm" variant="outline" onClick={() => move(1)}><ChevronRight/></Button></div><label className="mr-3 text-xs"><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> loop</label><label className="text-xs"><input type="checkbox" checked={autoplay} onChange={(e) => setAutoplay(e.target.checked)} /> autoplay {autoplay && "on"}</label></div></Block>
      <Block title="Menubar"><nav aria-label="Application menu" className="space-y-2"><div className="flex rounded border"><Button variant="ghost">File <ChevronDown/></Button><Button variant="ghost">Edit <ChevronDown/></Button><Button variant="ghost">View <ChevronDown/></Button></div><div className="rounded border p-2 text-sm"><div>New session <kbd className="float-right">⌘N</kbd></div><div className="pl-3">Export submenu ›</div><label><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> Show sidebar</label>{["Fast", "Balanced"].map((x) => <label className="block" key={x}><input type="radio" name="mode" checked={radio === x} onChange={() => setRadio(x)} /> {x}</label>)}</div></nav></Block>
      <Block title="Resizable"><div className="space-y-2"><div className="flex gap-2">{select("Resize orientation", resizeOrientation, setResizeOrientation, ["horizontal", "vertical"])}<Button size="sm" variant="outline" onClick={() => setCollapsed((x) => !x)}>{collapsed ? "Expand" : "Collapse"}</Button></div>{!collapsed && <div data-testid="resizable-panel" className={`overflow-auto rounded border bg-muted p-3 text-sm ${resizeOrientation === "horizontal" ? "min-w-32 max-w-full resize-x" : "min-h-16 max-h-48 resize-y"}`} style={{ width: 220, height: 80 }}>Drag edge · min/max constrained</div>}<label className="text-xs"><input type="checkbox" checked={persist} onChange={(e) => setPersist(e.target.checked)} /> persist size {persist && "enabled"}</label></div></Block>
      <Block title="Message Scroller"><div className="space-y-2"><div className="h-24 overflow-auto rounded border p-2 text-xs"><p>Build started</p><p>Compiling components</p><p>{paused ? "Output paused" : "Streaming output…"}</p></div><label className="mr-3 text-xs"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> follow output</label><label className="text-xs"><input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} /> paused</label><Button size="sm" variant="outline">Jump to bottom</Button>{!paused && <span role="status" className="ml-2 text-xs">● streaming</span>}</div></Block>
      <Block title="Item"><div className="space-y-2"><div className="flex gap-2">{select("Item size", itemSize, setItemSize, ["sm", "md", "lg"])}<label className="text-xs"><input type="checkbox" checked={selected} onChange={(e) => setSelected(e.target.checked)} /> selected</label><label className="text-xs"><input type="checkbox" checked={itemDisabled} onChange={(e) => setItemDisabled(e.target.checked)} /> disabled</label></div><div aria-disabled={itemDisabled} data-selected={selected} className={`flex w-full items-center gap-2 rounded border text-left ${itemSize === "sm" ? "p-2" : itemSize === "lg" ? "p-4" : "p-3"} ${itemDisabled ? "opacity-50" : ""} ${selected ? "bg-muted" : ""}`}><Check className="size-4"/><span className="flex-1">fxcompute-01</span><Button size="sm" variant="ghost" disabled={itemDisabled}>Inspect</Button></div></div></Block>
      <Block title="Form"><form className="space-y-2" onSubmit={(e) => { e.preventDefault(); setPending(true); }} onReset={() => { setFormState("valid"); setPending(false); }}><Input aria-label="Project name" defaultValue="Stellarc" required aria-invalid={formState !== "valid"}/>{select("Form state", formState, setFormState, ["valid", "invalid", "server error"])}{formState !== "valid" && <p role="alert" className="text-xs text-destructive">{formState === "invalid" ? "Project name is invalid." : "Server rejected this project."}</p>}<div className="flex gap-2"><Button type="submit" disabled={pending}>{pending ? "Submitting…" : "Submit"}</Button><Button type="reset" variant="outline">Reset</Button></div></form></Block>
      <Block title="Navigation Menu"><nav aria-label="Docs navigation">{mobile ? <Button variant="outline"><Menu/> Menu</Button> : <div className="flex gap-1">{["Home", "Docs", "Components"].map((x) => <Button key={x} variant={active === x ? "secondary" : "ghost"} onClick={() => setActive(x)}>{x}{x === "Docs" && <ChevronDown/>}</Button>)}</div>}<div className="mt-2 rounded border p-2 text-xs">{active} / Getting started / Nested link</div></nav></Block>
      <Block title="Sidebar"><div className="space-y-2"><Button size="sm" variant="outline" onClick={() => setSidebarCollapsed((x) => !x)}>{sidebarCollapsed ? "Expand" : "Collapse"} sidebar</Button><aside aria-label="Workspace sidebar" className={`${mobile ? "max-w-52 shadow-lg" : sidebarCollapsed ? "w-12" : "w-52"} rounded border p-2 text-sm`}><strong>{sidebarCollapsed ? "ST" : "Stellarc"}</strong>{["Workspace", "Manage"].map((group) => <div key={group} className="mt-2"><div className="text-[10px] uppercase text-muted-foreground">{sidebarCollapsed ? "•" : group}</div>{["Sessions", "Projects"].map((x) => <button key={x} className={`block w-full rounded p-1 text-left ${x === "Sessions" ? "bg-muted font-medium" : ""}`}>{sidebarCollapsed ? x[0] : x}</button>)}</div>)}</aside></div></Block>
    </div>
  </ComponentPlayground>;
}
