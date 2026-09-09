import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCompleteProjectMilestone,
  useCreateProjectMilestone,
  useDeleteProjectMilestone,
  useReopenProjectMilestone,
  useUpdateProjectMilestone,
} from "@/hooks/mutations/project/use-project-milestone-mutations";
import useGetProject from "@/hooks/queries/project/use-get-project";
import useGetProjectMilestones from "@/hooks/queries/project/use-get-project-milestones";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { formatDateMedium } from "@/lib/format";

export default function ProjectMilestonesSection({
  projectId,
}: {
  projectId: string;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: "",
    description: "",
    targetDate: "",
    rank: "0",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { data = [], isLoading } = useGetProjectMilestones(projectId);
  // Gate on the EFFECTIVE Project resource privilege (the same check the API's
  // projectPrivilege("edit") middleware applies), intersected with the
  // organization-level update permission. Org permission alone would expose
  // controls to users the API rejects with 404.
  const viewerPrivilege = useGetProject({ id: projectId }).data
    ?.viewerPrivilege;
  const canEdit =
    useOrganizationPermission().canUpdateProjects() &&
    (viewerPrivilege === "edit" || viewerPrivilege === "manage");
  const complete = useCompleteProjectMilestone();
  const create = useCreateProjectMilestone();
  const update = useUpdateProjectMilestone();
  const remove = useDeleteProjectMilestone();
  const reopen = useReopenProjectMilestone();
  const reset = () => {
    setForm({ name: "", description: "", targetDate: "", rank: "0" });
    setEditingId(null);
  };
  const save = () => {
    const payload = {
      projectId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      targetDate: form.targetDate || null,
      rank: Number.parseInt(form.rank, 10) || 0,
    };
    if (editingId) update.mutate({ ...payload, milestoneId: editingId });
    else create.mutate(payload);
    reset();
  };
  return (
    <section className="space-y-3" data-testid="project-milestones">
      <h2 className="text-sm font-medium text-muted-foreground">
        {t("projects:milestones.title")}
      </h2>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label={t("projects:milestones.name")}
            placeholder={t("projects:milestones.name")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            aria-label={t("projects:milestones.description")}
            placeholder={t("projects:milestones.description")}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <Input
            aria-label={t("projects:milestones.targetDate")}
            type="date"
            value={form.targetDate}
            onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
          />
          <Input
            aria-label={t("projects:milestones.rank")}
            type="number"
            min="0"
            value={form.rank}
            onChange={(e) => setForm({ ...form, rank: e.target.value })}
          />
          <Button disabled={!form.name.trim()} onClick={save}>
            {t(editingId ? "projects:actions.save" : "projects:milestones.add")}
          </Button>
        </div>
      )}
      {isLoading ? (
        <p>{t("projects:milestones.loading")}</p>
      ) : data.length === 0 ? (
        <p>{t("projects:milestones.emptyDescription")}</p>
      ) : (
        <div className="space-y-2">
          {data.map((m) => (
            <div className="rounded-md border p-3" key={m.id}>
              <div className="flex justify-between">
                <strong>{m.name}</strong>
                <span>
                  {m.progress.percent === null
                    ? t("projects:milestones.noScopedWork")
                    : `${m.progress.percent}%`}
                </span>
              </div>
              {m.description && <p>{m.description}</p>}
              <p>
                {m.targetDate
                  ? formatDateMedium(m.targetDate)
                  : t("projects:milestones.noTargetDate")}
              </p>
              {m.completedBy && (
                <p>
                  {t("projects:milestones.completedBy", {
                    name: m.completedBy.name ?? m.completedBy.id,
                  })}
                </p>
              )}
              {canEdit && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(m.id);
                      setForm({
                        name: m.name,
                        description: m.description ?? "",
                        targetDate: m.targetDate ?? "",
                        rank: String(m.rank),
                      });
                    }}
                  >
                    {t("projects:milestones.edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      m.completedAt
                        ? reopen.mutate({ projectId, milestoneId: m.id })
                        : complete.mutate({ projectId, milestoneId: m.id })
                    }
                  >
                    {t(
                      m.completedAt
                        ? "projects:milestones.reopen"
                        : "projects:milestones.complete",
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteId(m.id)}
                  >
                    {t("projects:milestones.delete")}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {deleteId && (
        <div
          role="alertdialog"
          aria-label={t("projects:milestones.deleteTitle")}
          className="rounded-md border border-destructive bg-destructive/10 p-3"
        >
          <p>{t("projects:milestones.deleteDescription")}</p>
          <Button
            onClick={() => {
              remove.mutate({ projectId, milestoneId: deleteId });
              setDeleteId(null);
            }}
          >
            {t("projects:milestones.delete")}
          </Button>
          <Button variant="outline" onClick={() => setDeleteId(null)}>
            {t("projects:actions.cancel")}
          </Button>
        </div>
      )}
    </section>
  );
}
