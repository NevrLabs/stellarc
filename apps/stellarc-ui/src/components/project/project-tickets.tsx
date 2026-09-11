import { Ticket } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { TASK_STATUS_SLUGS } from "@/constants/task-statuses";
import type { ProjectTicket } from "@/fetchers/project/get-project-tickets";
import ProjectTicketRow from "./project-ticket-row";
import {
  canonicalStatusGroups,
  defaultProjectTicketFilters,
  filterAndSortProjectTickets,
  type ProjectTicketFilters,
  type ProjectTicketSort,
  type ProjectTicketView,
} from "./project-ticket-view-model";

type ProjectTicketPreferences = {
  view: ProjectTicketView;
  filters: ProjectTicketFilters;
};

function readPreferences(storageKey: string): ProjectTicketPreferences {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ProjectTicketPreferences>;
      return {
        view: parsed.view ?? "list",
        filters: { ...defaultProjectTicketFilters, ...parsed.filters },
      };
    }
  } catch {}
  return { view: "list", filters: defaultProjectTicketFilters };
}

function ProjectTicketTimeline({
  organizationSlug,
  tickets,
}: {
  organizationSlug: string;
  tickets: ProjectTicket[];
}) {
  const { t } = useTranslation();
  const dated = tickets.filter((ticket) => ticket.startDate || ticket.dueDate);
  const unscheduled = tickets.filter(
    (ticket) => !ticket.startDate && !ticket.dueDate,
  );
  const endpoints = dated
    .flatMap((ticket) => [ticket.startDate, ticket.dueDate])
    .filter((date): date is string => Boolean(date))
    .sort();
  const minimum = endpoints[0] ? Date.parse(endpoints[0]) : 0;
  const maximum = endpoints.at(-1) ? Date.parse(endpoints.at(-1) as string) : 0;
  const span = Math.max(maximum - minimum, 24 * 60 * 60 * 1000);

  return (
    <div className="space-y-3" data-testid="project-tickets-timeline">
      {endpoints.length > 0 ? (
        <output data-testid="project-ticket-timeline-bounds">
          {`${endpoints[0]?.slice(0, 10)} – ${endpoints.at(-1)?.slice(0, 10)}`}
        </output>
      ) : (
        <p>{t("projects:tickets.timeline.noScheduledWork")}</p>
      )}
      <div
        className="overflow-x-auto"
        data-testid="project-ticket-timeline-dated"
      >
        <div
          className="min-w-[42rem] space-y-2"
          data-testid="project-ticket-timeline-scale"
        >
          {dated.map((ticket) => (
            <div
              className="grid grid-cols-[minmax(12rem,1fr)_minmax(22rem,2fr)] gap-2"
              key={ticket.id}
            >
              <ProjectTicketRow
                organizationSlug={organizationSlug}
                ticket={ticket}
              />
              <div
                className="relative min-h-8 rounded bg-muted"
                data-testid={`project-ticket-timeline-rail-${ticket.id}`}
              >
                <div
                  className="absolute top-1/2 h-3 -translate-y-1/2 rounded bg-primary"
                  data-testid={`project-ticket-timeline-bar-${ticket.id}`}
                  style={{
                    left: `${((Date.parse(ticket.startDate ?? ticket.dueDate ?? "") - minimum) / span) * 100}%`,
                    width: `${Math.max(2, ((Date.parse(ticket.dueDate ?? ticket.startDate ?? "") - Date.parse(ticket.startDate ?? ticket.dueDate ?? "")) / span) * 100)}%`,
                  }}
                  title={`${ticket.startDate?.slice(0, 10) ?? ticket.dueDate?.slice(0, 10)} – ${ticket.dueDate?.slice(0, 10) ?? ticket.startDate?.slice(0, 10)}`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      {unscheduled.length > 0 && (
        <div data-testid="project-ticket-timeline-unscheduled">
          <h3>{t("projects:tickets.timeline.unassigned")}</h3>
          {unscheduled.map((ticket) => (
            <ProjectTicketRow
              key={ticket.id}
              organizationSlug={organizationSlug}
              ticket={ticket}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type ProjectTicketsProps = {
  organizationSlug: string;
  projectId?: string;
  tickets?: ProjectTicket[];
  isLoading?: boolean;
  error?: boolean;
};

export function ProjectTickets({
  organizationSlug,
  projectId = "unknown",
  tickets,
  isLoading,
  error,
}: ProjectTicketsProps) {
  const { t } = useTranslation();
  const storageKey = `project-ticket-preferences:${projectId}`;
  const [preferences, setPreferences] = useState<ProjectTicketPreferences>(() =>
    readPreferences(storageKey),
  );
  const { filters, view } = preferences;

  useEffect(() => setPreferences(readPreferences(storageKey)), [storageKey]);
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(preferences));
  }, [preferences, storageKey]);

  const visible = useMemo(
    () => filterAndSortProjectTickets(tickets ?? [], filters),
    [tickets, filters],
  );
  const update = (patch: Partial<ProjectTicketFilters>) =>
    setPreferences((current) => ({
      ...current,
      filters: { ...current.filters, ...patch },
    }));
  const statuses = Array.from(
    new Set((tickets ?? []).map((ticket) => ticket.status)),
  );
  const priorities = Array.from(
    new Set((tickets ?? []).map((ticket) => ticket.priority).filter(Boolean)),
  );

  if (isLoading)
    return (
      <div className="space-y-2 p-3" data-testid="project-tickets-loading">
        {[1, 2, 3].map((i) => (
          <Skeleton className="h-12 w-full" key={i} />
        ))}
      </div>
    );
  if (error)
    return (
      <Empty data-testid="project-tickets-error">
        <EmptyHeader>
          <EmptyTitle>{t("projects:tickets.loadError")}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );

  return (
    <section className="space-y-3" data-testid="project-ticket-shell">
      <div
        className="flex flex-wrap gap-2 p-3"
        data-testid="project-ticket-controls"
      >
        {(["list", "board", "timeline"] as const).map((option) => (
          <button
            aria-pressed={view === option}
            key={option}
            onClick={() =>
              setPreferences((current) => ({ ...current, view: option }))
            }
            type="button"
          >
            {t(`projects:tickets.views.${option}`)}
          </button>
        ))}
        <input
          aria-label={t("projects:tickets.filters.search")}
          onChange={(event) => update({ search: event.target.value })}
          placeholder={t("projects:tickets.filters.search")}
          value={filters.search}
        />
        <select
          aria-label={t("projects:tickets.filters.status")}
          onChange={(event) => update({ status: event.target.value })}
          value={filters.status}
        >
          <option value="">{t("projects:tickets.filters.status")}</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {t(`projects:tickets.status.${status}`, { defaultValue: status })}
            </option>
          ))}
        </select>
        <select
          aria-label={t("projects:tickets.filters.priority")}
          onChange={(event) => update({ priority: event.target.value })}
          value={filters.priority}
        >
          <option value="">{t("projects:tickets.filters.priority")}</option>
          {priorities.map((priority) => (
            <option key={priority} value={priority ?? ""}>
              {priority}
            </option>
          ))}
        </select>
        <select
          aria-label={t("projects:tickets.filters.schedule")}
          onChange={(event) =>
            update({
              schedule: event.target.value as ProjectTicketFilters["schedule"],
            })
          }
          value={filters.schedule}
        >
          <option value="all">{t("projects:tickets.filters.schedule")}</option>
          <option value="scheduled">
            {t("projects:tickets.filters.scheduled")}
          </option>
          <option value="unscheduled">
            {t("projects:tickets.filters.unscheduled")}
          </option>
        </select>
        <select
          aria-label={t("projects:tickets.sort.rank")}
          onChange={(event) =>
            update({ sort: event.target.value as ProjectTicketSort })
          }
          value={filters.sort}
        >
          <option value="rank">{t("projects:tickets.sort.rank")}</option>
          <option value="title">{t("projects:tickets.sort.title")}</option>
          <option value="priority">
            {t("projects:tickets.sort.priority")}
          </option>
          <option value="dueDate">{t("projects:tickets.sort.dueDate")}</option>
        </select>
        <button
          onClick={() =>
            update({ direction: filters.direction === "asc" ? "desc" : "asc" })
          }
          type="button"
        >
          {t(
            filters.direction === "asc"
              ? "projects:tickets.sort.directionAsc"
              : "projects:tickets.sort.directionDesc",
          )}
        </button>
        <button
          onClick={() =>
            setPreferences((current) => ({
              ...current,
              filters: defaultProjectTicketFilters,
            }))
          }
          type="button"
        >
          {t("projects:tickets.filters.clear")}
        </button>
      </div>
      {!tickets || tickets.length === 0 ? (
        <Empty data-testid="project-tickets-empty">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Ticket />
            </EmptyMedia>
            <EmptyTitle>{t("projects:tickets.emptyTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("projects:tickets.emptyDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : visible.length === 0 ? (
        <Empty data-testid="project-tickets-filtered-empty">
          <EmptyHeader>
            <EmptyTitle>{t("projects:tickets.emptyFilteredTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("projects:tickets.emptyFilteredDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : view === "board" ? (
        <ProjectTicketBoard
          organizationSlug={organizationSlug}
          tickets={visible}
        />
      ) : view === "timeline" ? (
        <ProjectTicketTimeline
          organizationSlug={organizationSlug}
          tickets={visible}
        />
      ) : (
        <div className="space-y-1" data-testid="project-tickets-list">
          {visible.map((ticket) => (
            <ProjectTicketRow
              key={ticket.id}
              organizationSlug={organizationSlug}
              ticket={ticket}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectTicketBoard({
  organizationSlug,
  tickets,
}: {
  organizationSlug: string;
  tickets: ProjectTicket[];
}) {
  const { t } = useTranslation();
  const groups = canonicalStatusGroups(tickets);
  const canonicalStatuses = TASK_STATUS_SLUGS;
  const canonical = new Set(canonicalStatuses);
  const other = tickets.filter((ticket) => !canonical.has(ticket.status));
  return (
    <div
      className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
      data-testid="project-tickets-board"
    >
      {canonicalStatuses.map((status) => (
        <div data-testid={`project-ticket-board-${status}`} key={status}>
          <h3>
            {t(`projects:tickets.status.${status}`, { defaultValue: status })}
          </h3>
          {(groups[status] ?? []).map((ticket) => (
            <ProjectTicketRow
              key={ticket.id}
              organizationSlug={organizationSlug}
              ticket={ticket}
            />
          ))}
        </div>
      ))}
      {other.length > 0 && (
        <div data-testid="project-ticket-board-other">
          <h3>{t("projects:tickets.board.otherStatus")}</h3>
          {other.map((ticket) => (
            <ProjectTicketRow
              key={ticket.id}
              organizationSlug={organizationSlug}
              ticket={ticket}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default ProjectTickets;
