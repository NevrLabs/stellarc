import { useState } from "react";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ComponentPlayground } from "../ComponentPlayground";
import { ControlRow } from "../controls";

export function ProgressPlayground() {
  const [value, setValue] = useState(64);
  const [max, setMax] = useState(100);
  const [label, setLabel] = useState(true);
  return <ComponentPlayground title="Progress" importLine={'import { Progress } from "@/components/ui/progress"'} controls={<><ControlRow label="Value"><Input aria-label="Value" type="number" min={0} max={max} value={value} onChange={(e) => setValue(Number(e.target.value))} className="h-7 w-20" /></ControlRow><ControlRow label="Maximum"><Input aria-label="Maximum" type="number" min={1} value={max} onChange={(e) => setMax(Math.max(1, Number(e.target.value)))} className="h-7 w-20" /></ControlRow><ControlRow label="Show label"><Switch checked={label} onCheckedChange={setLabel} /></ControlRow></>}><Progress value={value} max={max} className="w-64">{label && <><ProgressLabel>Upload progress</ProgressLabel><ProgressValue /></>}</Progress></ComponentPlayground>;
}
