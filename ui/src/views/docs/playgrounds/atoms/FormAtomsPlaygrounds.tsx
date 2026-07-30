import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { ComponentPlayground } from "../ComponentPlayground";
import { ControlRow } from "../controls";

export function TextFieldsPlayground() {
  const [type, setType] = useState("text");
  const [placeholder, setPlaceholder] = useState("Session name");
  const [disabled, setDisabled] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [required, setRequired] = useState(false);
  const [invalid, setInvalid] = useState(false);
  return <ComponentPlayground title="Input, Textarea & Label" importLine={'import { Input, Textarea, Label } from "@/components/ui/*"'} controls={<><ControlRow label="Type"><NativeSelect aria-label="Input type" value={type} onChange={(e) => setType(e.target.value)}><NativeSelectOption value="text">Text</NativeSelectOption><NativeSelectOption value="email">Email</NativeSelectOption><NativeSelectOption value="password">Password</NativeSelectOption><NativeSelectOption value="number">Number</NativeSelectOption></NativeSelect></ControlRow><ControlRow label="Placeholder"><Input aria-label="Placeholder" value={placeholder} onChange={(e) => setPlaceholder(e.target.value)} className="h-7 w-28" /></ControlRow><ControlRow label="Disabled"><Switch checked={disabled} onCheckedChange={setDisabled} /></ControlRow><ControlRow label="Read only"><Switch checked={readOnly} onCheckedChange={setReadOnly} /></ControlRow><ControlRow label="Required"><Switch checked={required} onCheckedChange={setRequired} /></ControlRow><ControlRow label="Invalid"><Switch checked={invalid} onCheckedChange={setInvalid} /></ControlRow></>}><div className="grid w-64 gap-3"><Label htmlFor="atom-input">Session name{required && " *"}</Label><Input id="atom-input" type={type} placeholder={placeholder} disabled={disabled} readOnly={readOnly} required={required} aria-invalid={invalid} /><Textarea aria-label="Notes" placeholder="Notes…" disabled={disabled} readOnly={readOnly} required={required} aria-invalid={invalid} /></div></ComponentPlayground>;
}

export function ChoiceAtomsPlayground() {
  const [checked, setChecked] = useState(true);
  const [disabled, setDisabled] = useState(false);
  return <ComponentPlayground title="Checkbox, Switch & Toggle" importLine={'import { Checkbox, Switch, Toggle } from "@/components/ui/*"'} controls={<><ControlRow label="Checked / pressed"><Switch checked={checked} onCheckedChange={setChecked} /></ControlRow><ControlRow label="Disabled"><Switch checked={disabled} onCheckedChange={setDisabled} /></ControlRow></>}><label className="flex items-center gap-2"><Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} disabled={disabled} /> Checkbox</label><label className="flex items-center gap-2"><Switch checked={checked} onCheckedChange={setChecked} disabled={disabled} /> Switch</label><Toggle pressed={checked} onPressedChange={setChecked} disabled={disabled}>Toggle</Toggle></ComponentPlayground>;
}

export function NativeSelectPlayground() {
  const [disabled, setDisabled] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [size, setSize] = useState<"sm" | "default">("default");
  return <ComponentPlayground title="Native Select" importLine={'import { NativeSelect } from "@/components/ui/native-select"'} controls={<><ControlRow label="Size"><NativeSelect aria-label="Select size" value={size} onChange={(e) => setSize(e.target.value as typeof size)}><NativeSelectOption value="sm">Small</NativeSelectOption><NativeSelectOption value="default">Default</NativeSelectOption></NativeSelect></ControlRow><ControlRow label="Disabled"><Switch checked={disabled} onCheckedChange={setDisabled} /></ControlRow><ControlRow label="Invalid"><Switch checked={invalid} onCheckedChange={setInvalid} /></ControlRow></>}><NativeSelect aria-label="Agent" size={size} disabled={disabled} aria-invalid={invalid}><NativeSelectOption>Hermes</NativeSelectOption><NativeSelectOption>Claude Code</NativeSelectOption></NativeSelect></ComponentPlayground>;
}

export function RadioGroupPlayground() {
  const [value, setValue] = useState("fast");
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("vertical");
  const [disabled, setDisabled] = useState(false);
  return <ComponentPlayground title="Radio Group" importLine={'import { RadioGroup } from "@/components/ui/radio-group"'} controls={<><ControlRow label="Orientation"><NativeSelect aria-label="Radio orientation" value={orientation} onChange={(e) => setOrientation(e.target.value as typeof orientation)}><NativeSelectOption value="vertical">Vertical</NativeSelectOption><NativeSelectOption value="horizontal">Horizontal</NativeSelectOption></NativeSelect></ControlRow><ControlRow label="Disabled"><Switch checked={disabled} onCheckedChange={setDisabled} /></ControlRow></>}><RadioGroup value={value} onValueChange={setValue} disabled={disabled} className={orientation === "horizontal" ? "flex w-auto" : "w-auto"}>{[["fast","Fast"],["balanced","Balanced"],["thorough","Thorough"]].map(([v, label]) => <Label key={v} className="flex items-center gap-2"><RadioGroupItem value={v} />{label}</Label>)}</RadioGroup></ComponentPlayground>;
}

export function SliderPlayground() {
  const [value, setValue] = useState([40]);
  const [max, setMax] = useState(100);
  const [step, setStep] = useState(10);
  const [disabled, setDisabled] = useState(false);
  return <ComponentPlayground title="Slider" importLine={'import { Slider } from "@/components/ui/slider"'} controls={<><ControlRow label="Maximum"><Input aria-label="Slider maximum" type="number" value={max} onChange={(e) => setMax(Number(e.target.value))} className="h-7 w-20" /></ControlRow><ControlRow label="Step"><Input aria-label="Slider step" type="number" value={step} onChange={(e) => setStep(Number(e.target.value))} className="h-7 w-20" /></ControlRow><ControlRow label="Disabled"><Switch checked={disabled} onCheckedChange={setDisabled} /></ControlRow></>}><div className="w-64 space-y-3"><Slider aria-label="Value" value={value} onValueChange={(next) => setValue(Array.isArray(next) ? [...next] : [next])} min={0} max={max} step={step} disabled={disabled} /><div className="text-xs text-muted-foreground">Value: {value[0]}</div></div></ComponentPlayground>;
}
