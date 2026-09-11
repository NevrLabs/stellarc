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
import { Textarea } from "@/components/ui/textarea";
import useRenameProjectSlug from "@/hooks/mutations/project/use-rename-project-slug";
import useUpdateProject from "@/hooks/mutations/project/use-update-project";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetOrganizationMembers from "@/hooks/queries/organization-members/use-get-organization-members";
import { toast } from "@/lib/toast";

const LIFECYCLE_STATUSES = [
  "planned",
  "started",
  "completed",
  "canceled",
] as const;

export type ProjectPropertiesFormProject = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  status: (typeof LIFECYCLE_STATUSES)[number];
  priority: string | null;
  icon: string | null;
  color: string | null;
  description: string | null;
  successCriteria: string | null;
  leadUserId: string;
  leadTeamId: string | null;
  startDate: string | null;
  targetDate: string | null;
  orgPrivilege: string | null;
};

type ProjectPropertiesFormProps = {
  project: ProjectPropertiesFormProject;
};

/**
 * Edit metadata (BoardPropertiesPanel equivalent) and rename slug — two
 * separate mutations, matching the API split (`PUT /project/:id` has no
 * slug field; `PUT /project/:id/slug` is its own endpoint).
 */
export function ProjectPropertiesForm({ project }: ProjectPropertiesFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(project.name);
  const [summary, setSummary] = useState(project.summary);
  const [status, setStatus] = useState(project.status);
  const [description, setDescription] = useState(project.description ?? "");
  const [successCriteria, setSuccessCriteria] = useState(
    project.successCriteria ?? "",
  );
  const [targetDate, setTargetDate] = useState(project.targetDate ?? "");
  const [leadUserId, setLeadUserId] = useState(project.leadUserId);
  const [slug, setSlug] = useState(project.slug);

  const { data: organization } = useActiveOrganization();
  const { data: members } = useGetOrganizationMembers({
    organizationId: organization?.id,
  });
  const { mutateAsync: updateProject, isPending: isSaving } =
    useUpdateProject();
  const { mutateAsync: renameSlug, isPending: isRenaming } =
    useRenameProjectSlug();

  const handleSave = async () => {
    try {
      await updateProject({
        id: project.id,
        name,
        summary,
        status,
        priority: project.priority,
        icon: project.icon,
        color: project.color,
        description: description || null,
        successCriteria: successCriteria || null,
        leadUserId,
        leadTeamId: project.leadTeamId,
        startDate: project.startDate,
        targetDate: targetDate || null,
        orgPrivilege: project.orgPrivilege,
      });
      toast.success(t("projects:outcomes.updateSuccess"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("projects:outcomes.error"),
      );
    }
  };

  const handleRenameSlug = async () => {
    if (slug === project.slug) return;
    try {
      await renameSlug({ id: project.id, slug });
      toast.success(t("projects:outcomes.updateSuccess"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("projects:outcomes.error"),
      );
    }
  };

  return (
    <div className="space-y-4 p-4" data-testid="project-properties-form">
      <Input
        onChange={(e) => setName(e.target.value)}
        placeholder={t("projects:labels.name")}
        value={name}
      />
      <Input
        onChange={(e) => setSummary(e.target.value)}
        placeholder={t("projects:labels.summary")}
        value={summary}
      />
      <Textarea
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("projects:labels.description")}
        value={description}
      />
      <Textarea
        onChange={(e) => setSuccessCriteria(e.target.value)}
        placeholder={t("projects:labels.successCriteria")}
        value={successCriteria}
      />
      <Select
        onValueChange={(v) => setStatus(v as typeof status)}
        value={status}
      >
        <SelectTrigger aria-label={t("projects:labels.lifecycle")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LIFECYCLE_STATUSES.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`projects:lifecycle.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select onValueChange={setLeadUserId} value={leadUserId}>
        <SelectTrigger aria-label={t("projects:labels.lead")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {members?.map((member) => (
            <SelectItem key={member.userId} value={member.userId}>
              {member.user?.name ?? member.user?.email ?? member.userId}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        onChange={(e) => setTargetDate(e.target.value)}
        placeholder={t("projects:labels.targetDate")}
        type="date"
        value={targetDate}
      />
      <Button disabled={isSaving} onClick={() => void handleSave()}>
        {isSaving ? t("projects:actions.saving") : t("projects:actions.save")}
      </Button>

      <div className="flex items-center gap-2 border-t border-border pt-4">
        <Input
          aria-label={t("projects:actions.renameSlug")}
          onChange={(e) => setSlug(e.target.value)}
          value={slug}
        />
        <Button
          disabled={isRenaming || slug === project.slug}
          onClick={() => void handleRenameSlug()}
          variant="outline"
        >
          {t("projects:actions.renameSlug")}
        </Button>
      </div>
    </div>
  );
}

export default ProjectPropertiesForm;
