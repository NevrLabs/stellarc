import { useMemo } from "react";
import { max } from "d3-array";
import { scaleLinear } from "d3-scale";
import { defineChart, lineY } from "@tanstack/charts";
import { Chart } from "@tanstack/react-charts";

const rows = [
  { id: "mon", day: 1, turns: 18 },
  { id: "tue", day: 2, turns: 31 },
  { id: "wed", day: 3, turns: 24 },
  { id: "thu", day: 4, turns: 46 },
  { id: "fri", day: 5, turns: 39 },
  { id: "sat", day: 6, turns: 52 },
  { id: "sun", day: 7, turns: 48 },
] as const;

export function TanStackChartDemo() {
  const definition = useMemo(() => {
    const turnsMax = max(rows, (row) => row.turns) ?? 0;
    return defineChart({
      marks: [
        lineY(rows, {
          id: "agent-turns",
          x: "day",
          y: "turns",
          key: "id",
          stroke: "var(--accent)",
          points: true,
        }),
      ],
      x: {
        scale: scaleLinear().domain([1, 7]),
        label: "Day",
        format: (value) => ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][Number(value)] ?? String(value),
      },
      y: {
        scale: scaleLinear().domain([0, turnsMax]).nice(),
        label: "Agent turns",
        grid: true,
      },
    });
  }, []);

  return (
    <Chart
      definition={definition}
      height={260}
      initialWidth={640}
      ariaLabel="Agent turns during the last seven days"
      ariaDescription="A line chart rising from 18 turns on Monday to 48 on Sunday."
      tooltip
      keyboard
      animate={false}
    />
  );
}
