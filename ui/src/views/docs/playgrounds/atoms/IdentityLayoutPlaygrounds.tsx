import { useState } from "react";
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { ComponentPlayground } from "../ComponentPlayground";
import { ControlRow } from "../controls";

export function AvatarPlayground() {
  const [size, setSize] = useState<"sm" | "default" | "lg">("default");
  const [broken, setBroken] = useState(false);
  const [status, setStatus] = useState(true);
  return <ComponentPlayground title="Avatar" importLine={'import { Avatar } from "@/components/ui/avatar"'} controls={<><ControlRow label="Size"><NativeSelect aria-label="Avatar size" value={size} onChange={(e) => setSize(e.target.value as typeof size)}>{["sm","default","lg"].map((v) => <NativeSelectOption key={v}>{v}</NativeSelectOption>)}</NativeSelect></ControlRow><ControlRow label="Image error"><Switch checked={broken} onCheckedChange={setBroken} /></ControlRow><ControlRow label="Status"><Switch checked={status} onCheckedChange={setStatus} /></ControlRow></>}><Avatar size={size}>{!broken && <AvatarImage src="/stellarc.svg" alt="Stellarc" />}<AvatarFallback>ST</AvatarFallback>{status && <AvatarBadge aria-label="Online" />}</Avatar></ComponentPlayground>;
}

export function BadgePlayground() {
  const [variant, setVariant] = useState<"default" | "secondary" | "outline" | "destructive" | "ghost">("default");
  const [label, setLabel] = useState("Online");
  return <ComponentPlayground title="Badge" importLine={'import { Badge } from "@/components/ui/badge"'} controls={<><ControlRow label="Variant"><NativeSelect aria-label="Badge variant" value={variant} onChange={(e) => setVariant(e.target.value as typeof variant)}>{["default","secondary","outline","destructive","ghost"].map((v) => <NativeSelectOption key={v}>{v}</NativeSelectOption>)}</NativeSelect></ControlRow><ControlRow label="Label"><Input aria-label="Badge label" value={label} onChange={(e) => setLabel(e.target.value)} className="h-7 w-28" /></ControlRow></>}><Badge variant={variant}>{label}</Badge></ComponentPlayground>;
}

export function LayoutAtomsPlayground() {
  const [marker, setMarker] = useState<"default" | "separator" | "border">("separator");
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const [decorative, setDecorative] = useState(true);
  const [ratio, setRatio] = useState("16/9");
  return <ComponentPlayground title="Marker, Separator & Aspect Ratio" importLine={'import { Marker, Separator } from "@/components/ui/*"'} controls={<><ControlRow label="Marker"><NativeSelect aria-label="Marker variant" value={marker} onChange={(e) => setMarker(e.target.value as typeof marker)}>{["default","separator","border"].map((v) => <NativeSelectOption key={v}>{v}</NativeSelectOption>)}</NativeSelect></ControlRow><ControlRow label="Orientation"><NativeSelect aria-label="Separator orientation" value={orientation} onChange={(e) => setOrientation(e.target.value as typeof orientation)}><NativeSelectOption>horizontal</NativeSelectOption><NativeSelectOption>vertical</NativeSelectOption></NativeSelect></ControlRow><ControlRow label="Decorative"><Switch checked={decorative} onCheckedChange={setDecorative} /></ControlRow><ControlRow label="Ratio"><NativeSelect aria-label="Aspect ratio" value={ratio} onChange={(e) => setRatio(e.target.value)}><NativeSelectOption value="16/9">16:9</NativeSelectOption><NativeSelectOption value="4/3">4:3</NativeSelectOption><NativeSelectOption value="1/1">1:1</NativeSelectOption></NativeSelect></ControlRow></>}><div className="w-64 space-y-4"><Marker variant={marker}><MarkerContent>Environment</MarkerContent></Marker><div className="flex h-10 items-center gap-3"><span>One</span><Separator orientation={orientation} role={decorative ? "presentation" : "separator"} className={orientation === "vertical" ? "h-8" : undefined} /><span>Two</span></div><div className="w-48 overflow-hidden rounded-lg bg-muted" style={{ aspectRatio: ratio }}><div className="grid h-full place-items-center text-xs text-muted-foreground">CSS {ratio}</div></div></div></ComponentPlayground>;
}

export function KbdPlayground() {
  const [platform, setPlatform] = useState("mac");
  return <ComponentPlayground title="Keyboard Key" importLine={'import { Kbd } from "@/components/ui/kbd"'} controls={<ControlRow label="Platform"><NativeSelect aria-label="Keyboard platform" value={platform} onChange={(e) => setPlatform(e.target.value)}><NativeSelectOption value="mac">macOS</NativeSelectOption><NativeSelectOption value="other">Windows / Linux</NativeSelectOption></NativeSelect></ControlRow>}><KbdGroup><Kbd>{platform === "mac" ? "⌘" : "Ctrl"}</Kbd><span>+</span><Kbd>K</Kbd></KbdGroup></ComponentPlayground>;
}
