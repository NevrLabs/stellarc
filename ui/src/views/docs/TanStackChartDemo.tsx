import { useMemo, useState } from "react";
import { max } from "d3-array";
import { scaleLinear } from "d3-scale";
import { areaY, barY, defineChart, dot, lineY } from "@tanstack/charts";
import { Chart } from "@tanstack/react-charts";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { ComponentPlayground } from "./playgrounds/ComponentPlayground";
import { ControlRow } from "./playgrounds/controls";

const completeRows = [
  { id: "mon", day: 1, turns: 18 }, { id: "tue", day: 2, turns: 31 },
  { id: "wed", day: 3, turns: 24 }, { id: "thu", day: 4, turns: 46 },
  { id: "fri", day: 5, turns: 39 }, { id: "sat", day: 6, turns: 52 },
  { id: "sun", day: 7, turns: 48 },
] as const;
type ChartType = "line" | "bar" | "area" | "dots" | "sparkline";

export function TanStackChartDemo() {
  const [type, setType] = useState<ChartType>("line");
  const [state, setState] = useState<"data" | "loading" | "empty" | "error">("data");
  const [missing, setMissing] = useState(false);
  const [dense, setDense] = useState(false);
  const rows = useMemo(() => dense ? Array.from({ length: 90 }, (_, i) => ({ id: String(i), day: i + 1, turns: 25 + Math.round(Math.sin(i / 5) * 18) })) : completeRows.filter((_, i) => !missing || i !== 3), [dense, missing]);
  const definition = useMemo(() => {
    const turnsMax = max(rows, (row) => row.turns) ?? 0;
    const options = { id: "agent-turns", x: "day", y: "turns", key: "id", fill: "var(--accent)", stroke: "var(--accent)" } as const;
    const marks = type === "bar" ? [barY(rows, options)] : type === "area" ? [areaY(rows, options)] : type === "dots" ? [dot(rows, options)] : [lineY(rows, { ...options, points: type !== "sparkline" })];
    return defineChart({ marks, x: { scale: scaleLinear().domain([1, rows.length || 7]), label: type === "sparkline" ? undefined : "Day" }, y: { scale: scaleLinear().domain([0, turnsMax]).nice(), label: type === "sparkline" ? undefined : "Agent turns", grid: type !== "sparkline" } });
  }, [rows, type]);
  return <ComponentPlayground title="TanStack Charts" importLine={'import { Chart } from "@tanstack/react-charts"'} controls={<><ControlRow label="Chart type"><NativeSelect aria-label="Chart type" value={type} onChange={(e) => setType(e.target.value as ChartType)}>{["line","bar","area","dots","sparkline"].map((x) => <NativeSelectOption key={x}>{x}</NativeSelectOption>)}</NativeSelect></ControlRow><ControlRow label="State"><NativeSelect aria-label="Chart state" value={state} onChange={(e) => setState(e.target.value as typeof state)}>{["data","loading","empty","error"].map((x) => <NativeSelectOption key={x}>{x}</NativeSelectOption>)}</NativeSelect></ControlRow><ControlRow label="Missing point"><Switch checked={missing} onCheckedChange={setMissing} /></ControlRow><ControlRow label="Dense data"><Switch checked={dense} onCheckedChange={setDense} /></ControlRow></>}><div className="w-full min-w-0">{state === "loading" ? <div role="status" className="h-64 animate-pulse rounded-lg bg-muted" /> : state === "empty" ? <div className="grid h-64 place-items-center text-muted-foreground">No chart data.</div> : state === "error" ? <div role="alert" className="grid h-64 place-items-center text-destructive">Could not load chart data.</div> : <Chart definition={definition} height={type === "sparkline" ? 120 : 260} initialWidth={640} ariaLabel="Agent turns" ariaDescription={`${type} chart of agent turns over time.`} tooltip keyboard animate={false} />}</div></ComponentPlayground>;
}
