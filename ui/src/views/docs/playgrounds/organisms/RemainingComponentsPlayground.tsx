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
const Block = ({ children }: { children: React.ReactNode }) => <div className="w-full">{children}</div>;

export function DirectionPlayground() {
  const [rtl, setRtl] = useState(false);
  return <ComponentPlayground title="Direction" importLine="Native dir attribute — no wrapper" controls={<ControlRow label="RTL"><Switch aria-label="RTL direction" checked={rtl} onCheckedChange={setRtl} /></ControlRow>}>
    <Block><div dir={rtl ? "rtl" : "ltr"} className="rounded bg-muted p-3 text-sm" data-testid="direction-preview">{rtl ? "RTL: مرحبا بالعالم" : "LTR: Hello world"}</div></Block>
  </ComponentPlayground>;
}

export function InputOTPPlayground() {
  const [otpLength, setOtpLength] = useState<"4" | "6" | "8">("6");
  const [otpPattern, setOtpPattern] = useState<"numeric" | "alphanumeric">("numeric");
  const [otp, setOtp] = useState("");
  const [otpDisabled, setOtpDisabled] = useState(false);
  const [otpInvalid, setOtpInvalid] = useState(false);
  return <ComponentPlayground title="Input OTP" importLine={'import { Input } from "@/components/ui/input"'} controls={<><ControlRow label="Length">{select("OTP length", otpLength, setOtpLength, ["4", "6", "8"])}</ControlRow><ControlRow label="Pattern">{select("OTP pattern", otpPattern, setOtpPattern, ["numeric", "alphanumeric"])}</ControlRow></>}>
    <Block><div className="space-y-2"><Input aria-label="One-time password" value={otp} onChange={(e) => setOtp(e.target.value.slice(0, Number(otpLength)).replace(otpPattern === "numeric" ? /\D/g : /[^a-z0-9]/gi, ""))} maxLength={Number(otpLength)} inputMode={otpPattern === "numeric" ? "numeric" : "text"} disabled={otpDisabled} aria-invalid={otpInvalid} placeholder={`${otpLength}-character code`} /><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setOtp("12345678".slice(0, Number(otpLength)))}>Paste sample</Button><label className="text-xs"><input type="checkbox" checked={otpDisabled} onChange={(e) => setOtpDisabled(e.target.checked)} /> disabled</label><label className="text-xs"><input type="checkbox" checked={otpInvalid} onChange={(e) => setOtpInvalid(e.target.checked)} /> invalid</label></div></div></Block>
  </ComponentPlayground>;
}

export function ToastPlayground() {
  const [toastTone, setToastTone] = useState<"info" | "success" | "warning" | "error">("info");
  const [toastDuration, setToastDuration] = useState("5000");
  const [toastDismissible, setToastDismissible] = useState(true);
  const [toastVisible, setToastVisible] = useState(true);
  const tone = { info: "border-blue-500", success: "border-green-500", warning: "border-yellow-500", error: "border-destructive" }[toastTone];
  return <ComponentPlayground title="Toast" importLine="Native status region — no wrapper" controls={<><ControlRow label="Tone">{select("Toast tone", toastTone, setToastTone, ["info", "success", "warning", "error"])}</ControlRow><ControlRow label="Duration"><Input aria-label="Toast duration" type="number" value={toastDuration} onChange={(e) => setToastDuration(e.target.value)} className="h-7 w-24 text-xs" /></ControlRow><ControlRow label="Dismissible"><Switch checked={toastDismissible} onCheckedChange={setToastDismissible} /></ControlRow></>}>
    <Block><div className="space-y-2">{toastVisible && <div role="status" className={`flex items-center gap-2 rounded border-l-4 p-2 text-sm ${tone}`}><span className="flex-1">{toastTone}: Build finished ({toastDuration}ms)</span><Button size="sm" variant="ghost">View</Button>{toastDismissible && <Button aria-label="Dismiss toast" size="icon-sm" variant="ghost" onClick={() => setToastVisible(false)}>×</Button>}</div>}<Button size="sm" onClick={() => setToastVisible(true)}>Show</Button></div></Block>
  </ComponentPlayground>;
}

export function AttachmentPlayground() {
  const [fileType, setFileType] = useState<"image" | "doc" | "code">("image");
  const [progress, setProgress] = useState(64);
  const [removable, setRemovable] = useState(true);
  const FileIcon = fileType === "image" ? Image : fileType === "code" ? File : Paperclip;
  return <ComponentPlayground title="Attachment" importLine={'import { Progress } from "@/components/ui/progress"'} controls={<><ControlRow label="File type">{select("File type", fileType, setFileType, ["image", "doc", "code"])}</ControlRow><ControlRow label="Removable"><Switch checked={removable} onCheckedChange={setRemovable} /></ControlRow></>}>
    <Block><div className="space-y-2"><div className="flex items-center gap-2 rounded border p-2"><FileIcon className="size-5"/><div className="min-w-0 flex-1 text-sm"><div>design-system.{fileType === "image" ? "png" : fileType === "code" ? "tsx" : "pdf"}</div><div className="text-xs text-muted-foreground">2.4 MB</div><Progress value={progress} /></div>{removable && <Button aria-label="Remove attachment" size="icon-sm" variant="ghost"><Trash2 /></Button>}</div><input aria-label="Upload progress" type="range" min="0" max="100" value={progress} onChange={(e) => setProgress(Number(e.target.value))}/></div></Block>
  </ComponentPlayground>;
}

export function BubblePlayground() {
  const [role, setRole] = useState<"user" | "assistant">("assistant");
  const [streaming, setStreaming] = useState(false);
  return <ComponentPlayground title="Bubble" importLine="Native layout — no wrapper" controls={<><ControlRow label="Role">{select("Bubble role", role, setRole, ["user", "assistant"])}</ControlRow><ControlRow label="Streaming"><Switch checked={streaming} onCheckedChange={setStreaming} /></ControlRow></>}>
    <Block><div className={`flex ${role === "user" ? "justify-end" : "justify-start"}`}><div className="max-w-xs rounded-xl bg-muted p-3 text-sm">{streaming ? "Generating response… ▍" : "Response complete"}<div className="mt-1 text-[10px] text-muted-foreground">{streaming ? "streaming" : "delivered"}</div></div></div></Block>
  </ComponentPlayground>;
}

export function MessagePlayground() {
  const [messageFrom, setMessageFrom] = useState<"user" | "assistant" | "system">("assistant");
  const [contentType, setContentType] = useState<"text" | "markdown" | "code">("markdown");
  return <ComponentPlayground title="Message" importLine="Native article — no wrapper" controls={<><ControlRow label="From">{select("Message from", messageFrom, setMessageFrom, ["user", "assistant", "system"])}</ControlRow><ControlRow label="Content">{select("Content type", contentType, setContentType, ["text", "markdown", "code"])}</ControlRow></>}>
    <Block><article className="rounded border p-3 text-sm"><strong>{messageFrom}</strong><pre className="mt-1 whitespace-pre-wrap">{contentType === "code" ? "const ready = true;" : contentType === "markdown" ? "**Ready** to deploy." : "Ready to deploy."}</pre><div className="mt-2 flex gap-1"><Button size="sm" variant="ghost">Copy</Button><Button size="sm" variant="ghost">Retry</Button></div></article></Block>
  </ComponentPlayground>;
}

export function CalendarPlayground() {
  const [calendarMode, setCalendarMode] = useState<"single" | "range">("single");
  const [locale, setLocale] = useState<"en-US" | "de-DE" | "ja-JP">("en-US");
  return <ComponentPlayground title="Calendar" importLine="Native date input — no wrapper" controls={<><ControlRow label="Mode">{select("Calendar selection", calendarMode, setCalendarMode, ["single", "range"])}</ControlRow><ControlRow label="Locale">{select("Calendar locale", locale, setLocale, ["en-US", "de-DE", "ja-JP"])}</ControlRow></>}>
    <Block><div className="space-y-2"><div className="flex gap-2"><input aria-label="Start date" type="date" lang={locale} min="2026-08-01" />{calendarMode === "range" && <input aria-label="End date" type="date" lang={locale} min="2026-08-01" />}</div><p className="text-xs text-muted-foreground">Dates before Aug 1 are disabled · {locale}</p></div></Block>
  </ComponentPlayground>;
}

export function CarouselPlayground() {
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const [slide, setSlide] = useState(1);
  const [slides, setSlides] = useState(3);
  const [loop, setLoop] = useState(true);
  const [autoplay, setAutoplay] = useState(false);
  const move = (delta: number) => setSlide((current) => loop ? (current - 1 + delta + slides) % slides + 1 : Math.min(slides, Math.max(1, current + delta)));
  return <ComponentPlayground title="Carousel" importLine="Native layout — no wrapper" controls={<><ControlRow label="Orientation">{select("Carousel orientation", orientation, setOrientation, ["horizontal", "vertical"])}</ControlRow><ControlRow label="Slides"><Input aria-label="Slide count" type="number" min="1" max="8" value={slides} onChange={(e) => { setSlides(Math.max(1, Number(e.target.value))); setSlide(1); }} className="h-7 w-16 text-xs" /></ControlRow><ControlRow label="Loop"><Switch checked={loop} onCheckedChange={setLoop} /></ControlRow><ControlRow label="Autoplay"><Switch checked={autoplay} onCheckedChange={setAutoplay} /></ControlRow></>}>
    <Block><div className={`flex items-center gap-2 ${orientation === "vertical" ? "flex-col" : ""}`}><Button aria-label="Previous slide" size="icon-sm" variant="outline" onClick={() => move(-1)}><ChevronLeft/></Button><div className="grid h-20 flex-1 place-items-center rounded bg-muted">Slide {slide} / {slides}</div><Button aria-label="Next slide" size="icon-sm" variant="outline" onClick={() => move(1)}><ChevronRight/></Button></div></Block>
  </ComponentPlayground>;
}

export function MenubarPlayground() {
  const [checked, setChecked] = useState(true);
  const [radio, setRadio] = useState("Balanced");
  return <ComponentPlayground title="Menubar" importLine="Native nav — no wrapper" controls={undefined}>
    <Block><nav aria-label="Application menu" className="space-y-2"><div className="flex rounded border"><Button variant="ghost">File <ChevronDown/></Button><Button variant="ghost">Edit <ChevronDown/></Button><Button variant="ghost">View <ChevronDown/></Button></div><div className="rounded border p-2 text-sm"><div>New session <kbd className="float-right">⌘N</kbd></div><div className="pl-3">Export submenu ›</div><label><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> Show sidebar</label>{["Fast", "Balanced"].map((x) => <label className="block" key={x}><input type="radio" name="mode" checked={radio === x} onChange={() => setRadio(x)} /> {x}</label>)}</div></nav></Block>
  </ComponentPlayground>;
}

export function ResizablePlayground() {
  const [resizeOrientation, setResizeOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const [collapsed, setCollapsed] = useState(false);
  const [persist, setPersist] = useState(false);
  return <ComponentPlayground title="Resizable" importLine="Native CSS resize — no wrapper" controls={<><ControlRow label="Orientation">{select("Resize orientation", resizeOrientation, setResizeOrientation, ["horizontal", "vertical"])}</ControlRow><ControlRow label="Persist"><Switch checked={persist} onCheckedChange={setPersist} /></ControlRow></>}>
    <Block><div className="space-y-2"><Button size="sm" variant="outline" onClick={() => setCollapsed((x) => !x)}>{collapsed ? "Expand" : "Collapse"}</Button>{!collapsed && <div data-testid="resizable-panel" className={`overflow-auto rounded border bg-muted p-3 text-sm ${resizeOrientation === "horizontal" ? "min-w-32 max-w-full resize-x" : "min-h-16 max-h-48 resize-y"}`} style={{ width: 220, height: 80 }}>Drag edge · min/max constrained</div>}<p className="text-xs text-muted-foreground">Persist size {persist ? "enabled" : "disabled"}</p></div></Block>
  </ComponentPlayground>;
}

export function MessageScrollerPlayground() {
  const [follow, setFollow] = useState(true);
  const [paused, setPaused] = useState(false);
  return <ComponentPlayground title="Message Scroller" importLine="Native scroll — no wrapper" controls={<><ControlRow label="Follow output"><Switch checked={follow} onCheckedChange={setFollow} /></ControlRow><ControlRow label="Paused"><Switch checked={paused} onCheckedChange={setPaused} /></ControlRow></>}>
    <Block><div className="space-y-2"><div className="h-24 overflow-auto rounded border p-2 text-xs"><p>Build started</p><p>Compiling components</p><p>{paused ? "Output paused" : "Streaming output…"}</p></div><div className="flex items-center gap-2"><Button size="sm" variant="outline">Jump to bottom</Button>{!paused && <span role="status" className="text-xs">● streaming</span>}</div></div></Block>
  </ComponentPlayground>;
}

export function ItemPlayground() {
  const [itemSize, setItemSize] = useState<"sm" | "md" | "lg">("md");
  const [selected, setSelected] = useState(true);
  const [itemDisabled, setItemDisabled] = useState(false);
  return <ComponentPlayground title="Item" importLine="Native list item — no wrapper" controls={<><ControlRow label="Size">{select("Item size", itemSize, setItemSize, ["sm", "md", "lg"])}</ControlRow><ControlRow label="Selected"><Switch checked={selected} onCheckedChange={setSelected} /></ControlRow><ControlRow label="Disabled"><Switch checked={itemDisabled} onCheckedChange={setItemDisabled} /></ControlRow></>}>
    <Block><div aria-disabled={itemDisabled} data-selected={selected} className={`flex w-full items-center gap-2 rounded border text-left ${itemSize === "sm" ? "p-2" : itemSize === "lg" ? "p-4" : "p-3"} ${itemDisabled ? "opacity-50" : ""} ${selected ? "bg-muted" : ""}`}><Check className="size-4"/><span className="flex-1">fxcompute-01</span><Button size="sm" variant="ghost" disabled={itemDisabled}>Inspect</Button></div></Block>
  </ComponentPlayground>;
}

export function FormPlayground() {
  const [formState, setFormState] = useState<"valid" | "invalid" | "server error">("valid");
  const [pending, setPending] = useState(false);
  return <ComponentPlayground title="Form" importLine={'import { Input, Button } from "@/components/ui/*"'} controls={<ControlRow label="State">{select("Form state", formState, setFormState, ["valid", "invalid", "server error"])}</ControlRow>}>
    <Block><form className="space-y-2" onSubmit={(e) => { e.preventDefault(); setPending(true); }} onReset={() => { setFormState("valid"); setPending(false); }}><Input aria-label="Project name" defaultValue="Stellarc" required aria-invalid={formState !== "valid"}/>{formState !== "valid" && <p role="alert" className="text-xs text-destructive">{formState === "invalid" ? "Project name is invalid." : "Server rejected this project."}</p>}<div className="flex gap-2"><Button type="submit" disabled={pending}>{pending ? "Submitting…" : "Submit"}</Button><Button type="reset" variant="outline">Reset</Button></div></form></Block>
  </ComponentPlayground>;
}

export function NavigationMenuPlayground() {
  const [active, setActive] = useState("Docs");
  const [mobile, setMobile] = useState(false);
  return <ComponentPlayground title="Navigation Menu" importLine="Native nav — no wrapper" controls={<ControlRow label="Mobile fallback"><Switch aria-label="Mobile fallback" checked={mobile} onCheckedChange={setMobile} /></ControlRow>}>
    <Block><nav aria-label="Docs navigation">{mobile ? <Button variant="outline"><Menu/> Menu</Button> : <div className="flex gap-1">{["Home", "Docs", "Components"].map((x) => <Button key={x} variant={active === x ? "secondary" : "ghost"} onClick={() => setActive(x)}>{x}{x === "Docs" && <ChevronDown/>}</Button>)}</div>}<div className="mt-2 rounded border p-2 text-xs">{active} / Getting started / Nested link</div></nav></Block>
  </ComponentPlayground>;
}

export function SidebarPlayground() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  return <ComponentPlayground title="Sidebar" importLine="Native aside — no wrapper" controls={<><ControlRow label="Collapse"><Switch checked={sidebarCollapsed} onCheckedChange={setSidebarCollapsed} /></ControlRow><ControlRow label="Mobile"><Switch checked={mobile} onCheckedChange={setMobile} /></ControlRow></>}>
    <Block><div className="space-y-2"><Button size="sm" variant="outline" onClick={() => setSidebarCollapsed((x) => !x)}>{sidebarCollapsed ? "Expand" : "Collapse"} sidebar</Button><aside aria-label="Workspace sidebar" className={`${mobile ? "max-w-52 shadow-lg" : sidebarCollapsed ? "w-12" : "w-52"} rounded border p-2 text-sm`}><strong>{sidebarCollapsed ? "ST" : "Stellarc"}</strong>{["Workspace", "Manage"].map((group) => <div key={group} className="mt-2"><div className="text-[10px] uppercase text-muted-foreground">{sidebarCollapsed ? "•" : group}</div>{["Sessions", "Projects"].map((x) => <button key={x} className={`block w-full rounded p-1 text-left ${x === "Sessions" ? "bg-muted font-medium" : ""}`}>{sidebarCollapsed ? x[0] : x}</button>)}</div>)}</aside></div></Block>
  </ComponentPlayground>;
}
