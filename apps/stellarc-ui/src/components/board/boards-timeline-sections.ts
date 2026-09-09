export type OverviewTimelineTask = {
  id: string;
  title: string;
  milestoneId?: string | null;
  startDate?: string | Date | null;
  dueDate?: string | Date | null;
};

export type OverviewTimelineMilestone = {
  id: string;
  name: string;
};

export type OverviewTimelineSection =
  | {
      kind: "milestone";
      milestone: OverviewTimelineMilestone;
      tasks: OverviewTimelineTask[];
    }
  | { kind: "unscheduled"; tasks: OverviewTimelineTask[] };

export function buildOverviewTimelineSections(
  tasks: OverviewTimelineTask[],
  milestones: OverviewTimelineMilestone[],
): OverviewTimelineSection[] {
  const scheduled = tasks.filter((task) => task.startDate || task.dueDate);
  const milestoneSections = milestones
    .map((milestone) => ({
      kind: "milestone" as const,
      milestone,
      tasks: scheduled.filter((task) => task.milestoneId === milestone.id),
    }))
    .filter((section) => section.tasks.length > 0);
  const unassigned = scheduled.filter(
    (task) =>
      !task.milestoneId || !milestones.some((m) => m.id === task.milestoneId),
  );
  return unassigned.length > 0
    ? [...milestoneSections, { kind: "unscheduled", tasks: unassigned }]
    : milestoneSections;
}
