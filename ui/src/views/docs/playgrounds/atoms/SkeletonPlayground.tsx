import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ComponentPlayground } from "../ComponentPlayground";
import { ControlRow } from "../controls";

export function SkeletonPlayground() {
  const [shape, setShape] = useState("text");
  const [count, setCount] = useState(3);
  const [motion, setMotion] = useState(true);
  const shapeClass = shape === "avatar" ? "size-10 rounded-full" : shape === "card" ? "h-24 w-64" : "h-4 w-48";
  return <ComponentPlayground title="Skeleton" importLine={'import { Skeleton } from "@/components/ui/skeleton"'} controls={<><ControlRow label="Shape"><NativeSelect aria-label="Shape" value={shape} onChange={(e) => setShape(e.target.value)}><NativeSelectOption value="text">Text</NativeSelectOption><NativeSelectOption value="avatar">Avatar</NativeSelectOption><NativeSelectOption value="card">Card</NativeSelectOption></NativeSelect></ControlRow><ControlRow label="Count"><Input aria-label="Count" type="number" min={1} max={6} value={count} onChange={(e) => setCount(Math.min(6, Math.max(1, Number(e.target.value))))} className="h-7 w-20" /></ControlRow><ControlRow label="Motion"><Switch checked={motion} onCheckedChange={setMotion} /></ControlRow></>}><div className="space-y-2">{Array.from({ length: count }, (_, i) => <Skeleton key={i} className={`${shapeClass} ${motion ? "" : "animate-none"}`} />)}</div></ComponentPlayground>;
}
