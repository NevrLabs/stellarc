import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectTicket } from "@/fetchers/project/get-project-tickets";
import useAddProjectTicket from "@/hooks/mutations/project/use-add-project-ticket";
import useAssignProjectTicketMilestone from "@/hooks/mutations/project/use-assign-project-ticket-milestone";
import useRemoveProjectTicket from "@/hooks/mutations/project/use-remove-project-ticket";
import useGetProjectMilestones from "@/hooks/queries/project/use-get-project-milestones";

type ProjectTicketPickerProps = {
  projectId: string;
  tickets: ProjectTicket[];
};

/**
 * Explicit add/remove membership control on the Tickets tab. Mutations report
 * API rejection through `mutationFn`'s throw — no optimistic ticket list or
 * aggregate changes are fabricated; success invalidates through the mutation
 * hooks.
 */
export function ProjectTicketPicker({
  projectId,
  tickets,
}: ProjectTicketPickerProps) {
  const { t } = useTranslation();
  const [taskId, setTaskId] = useState("");
  const add = useAddProjectTicket();
  const remove = useRemoveProjectTicket();
  const assignMilestone = useAssignProjectTicketMilestone();
  const { data: milestones = [] } = useGetProjectMilestones(projectId);

  return (
    <div className="space-y-3 p-3" data-testid="project-ticket-picker">
      <div className="flex gap-2">
        <Input
          aria-label={t("projects:tickets.add")}
          onChange={(event) => setTaskId(event.target.value)}
          placeholder={t("projects:validation.ticketRequired")}
          value={taskId}
        />
        <Button
          onClick={() => {
            if (taskId.trim()) {
              add.mutate({ id: projectId, taskId: taskId.trim() });
              setTaskId("");
            }
          }}
          variant="outline"
        >
          {t("projects:tickets.add")}
        </Button>
      </div>
      <ul className="space-y-1">
        {tickets.map((ticket) => (
          <li className="flex items-center gap-2" key={ticket.id}>
            <span className="min-w-0 flex-1 truncate text-sm">
              {ticket.key}
            </span>
            <Select
              onValueChange={(value) =>
                assignMilestone.mutate({
                  projectId,
                  taskId: ticket.id,
                  projectMilestoneId: value === "unassigned" ? null : value,
                })
              }
              value={ticket.projectMilestoneId ?? "unassigned"}
            >
              <SelectTrigger aria-label={t("projects:milestones.title")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">
                  {t("projects:milestones.unassigned")}
                </SelectItem>
                {milestones.map((milestone) => (
                  <SelectItem key={milestone.id} value={milestone.id}>
                    {milestone.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() =>
                remove.mutate({ id: projectId, taskId: ticket.id })
              }
              size="xs"
              variant="ghost"
            >
              {t("projects:tickets.remove")}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ProjectTicketPicker;
