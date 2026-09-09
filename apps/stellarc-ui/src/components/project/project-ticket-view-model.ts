import type { ProjectTicket } from "@/fetchers/project/get-project-tickets";

export type ProjectTicketView = "list" | "board" | "timeline";
export type ProjectTicketSort = "rank" | "title" | "priority" | "dueDate";
export type ProjectTicketFilters = {
  search: string;
  status: string;
  priority: string;
  schedule: "all" | "scheduled" | "unscheduled";
  sort: ProjectTicketSort;
  direction: "asc" | "desc";
};

export const defaultProjectTicketFilters: ProjectTicketFilters = {
  search: "",
  status: "",
  priority: "",
  schedule: "all",
  sort: "rank",
  direction: "asc",
};
export function filterAndSortProjectTickets(
  tickets: ProjectTicket[],
  filters: ProjectTicketFilters,
) {
  const query = filters.search.trim().toLocaleLowerCase();
  return tickets
    .filter((ticket) => {
      const matchesSearch =
        !query ||
        `${ticket.key} ${ticket.boardName} ${ticket.title}`
          .toLocaleLowerCase()
          .includes(query);
      const matchesSchedule =
        filters.schedule === "all" ||
        (filters.schedule === "scheduled"
          ? ticket.startDate !== null || ticket.dueDate !== null
          : ticket.startDate === null && ticket.dueDate === null);
      return (
        matchesSearch &&
        (!filters.status || ticket.status === filters.status) &&
        (!filters.priority || ticket.priority === filters.priority) &&
        matchesSchedule
      );
    })
    .sort((a, b) => {
      let result =
        filters.sort === "title"
          ? a.title.localeCompare(b.title)
          : filters.sort === "priority"
            ? (a.priority ?? "").localeCompare(b.priority ?? "")
            : filters.sort === "dueDate"
              ? (a.dueDate ?? "").localeCompare(b.dueDate ?? "")
              : a.rank - b.rank ||
                a.addedAt.localeCompare(b.addedAt) ||
                a.id.localeCompare(b.id);
      if (filters.sort !== "rank") result ||= a.key.localeCompare(b.key);
      return filters.direction === "asc" ? result : -result;
    });
}
export function canonicalStatusGroups(tickets: ProjectTicket[]) {
  const groups: Record<string, ProjectTicket[]> = {};
  for (const ticket of tickets) {
    groups[ticket.status] ??= [];
    groups[ticket.status].push(ticket);
  }
  return groups;
}
export function milestoneGroups(tickets: ProjectTicket[]) {
  const groups: Record<string, ProjectTicket[]> = { unassigned: [] };
  for (const ticket of tickets) {
    const key = ticket.projectMilestoneId ?? "unassigned";
    groups[key] ??= [];
    groups[key].push(ticket);
  }
  return groups;
}
