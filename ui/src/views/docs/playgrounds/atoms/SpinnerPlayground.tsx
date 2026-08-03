import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ComponentPlayground } from "../ComponentPlayground";
import { ControlRow } from "../controls";

export function SpinnerPlayground() {
  const [size, setSize] = useState("4");
  const [label, setLabel] = useState("Loading");
  const [context, setContext] = useState("inline");
  return <ComponentPlayground title="Spinner" importLine={'import { Spinner } from "@/components/ui/spinner"'} controls={<><ControlRow label="Size"><NativeSelect aria-label="Spinner size" value={size} onChange={(e) => setSize(e.target.value)}><NativeSelectOption value="3">Small</NativeSelectOption><NativeSelectOption value="4">Default</NativeSelectOption><NativeSelectOption value="6">Large</NativeSelectOption></NativeSelect></ControlRow><ControlRow label="Label"><Input aria-label="Accessible label" value={label} onChange={(e) => setLabel(e.target.value)} className="h-7 w-28" /></ControlRow><ControlRow label="Context"><NativeSelect aria-label="Context" value={context} onChange={(e) => setContext(e.target.value)}><NativeSelectOption value="inline">Inline</NativeSelectOption><NativeSelectOption value="block">Block</NativeSelectOption></NativeSelect></ControlRow></>}><span className={context === "block" ? "flex w-full flex-col items-center gap-2" : "inline-flex items-center gap-2"}><Spinner className={`size-${size}`} aria-label={label || "Loading"} /><span>{label}</span></span></ComponentPlayground>;
}
