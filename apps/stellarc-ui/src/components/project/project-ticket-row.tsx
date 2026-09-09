import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { ProjectTicket } from "@/fetchers/project/get-project-tickets";

type ProjectTicketRowProps = {
  organizationSlug: string;
  ticket: ProjectTicket;
};

/** Canonical board key + canonical Ticket route link; no Project-local numbering. */
export function ProjectTicketRow({
  organizationSlug,
  ticket,
}: ProjectTicketRowProps) {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center gap-3 border-b border-border px-3 py-3 last:border-b-0"
      data-testid="project-ticket-row"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{ticket.title}</p>
        <p className="truncate text-sm text-muted-foreground">
          {t("projects:tickets.boardKey")}: {ticket.key}
        </p>
      </div>
      <Badge variant="secondary">
        {t(`tasks:status.${ticket.status}`, { defaultValue: ticket.status })}
      </Badge>
      <Link
        className="text-sm text-muted-foreground hover:text-foreground"
        to="/dashboard/organization/$organizationSlug/board/$boardSlug/task/$taskId"
        params={{
          organizationSlug,
          boardSlug: ticket.boardSlug,
          taskId: ticket.id,
        }}
      >
        {t("projects:tickets.openTicket")}
      </Link>
    </div>
  );
}

export default ProjectTicketRow;
