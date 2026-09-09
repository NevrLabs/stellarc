import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDataTables } from "@/hooks/data-table/use-data-tables";
import useCreateProjectResourceLink from "@/hooks/mutations/project/use-create-project-resource-link";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import useGetRepos from "@/hooks/queries/repo/use-get-repos";
import type { ProjectResourceLinkData } from "./project-resource-row";

type Candidate = { id: string; name: string };

type ProjectResourceLinkDialogProps = {
  open: boolean;
  projectId: string;
  organizationId: string;
  linked: ProjectResourceLinkData[];
  onClose: () => void;
};

/**
 * KFL-368: add-link dialog. Groups Board/Repository/Table candidates from the
 * existing visibility-filtered resource hooks, excludes already-linked IDs,
 * and requires a resource + relationship before posting a typed payload.
 */
export function ProjectResourceLinkDialog({
  open,
  projectId,
  organizationId,
  linked,
  onClose,
}: ProjectResourceLinkDialogProps) {
  const { t } = useTranslation();
  const { data: boards = [] } = useGetBoards({ organizationId });
  const { data: repos = [] } = useGetRepos({ organizationId });
  const { data: tables = [] } = useDataTables(organizationId, open);

  const linkedIds = new Set(linked.map((l) => l.resourceId));

  const boardCandidates: Candidate[] = (
    boards as Array<{ id: string; name: string }>
  )
    .filter((b) => !linkedIds.has(b.id))
    .map((b) => ({ id: b.id, name: b.name }));
  const repoCandidates: Candidate[] = (
    repos as Array<{ id: string; name: string }>
  )
    .filter((r) => !linkedIds.has(r.id))
    .map((r) => ({ id: r.id, name: r.name }));
  const tableCandidates: Candidate[] = (
    tables as Array<{ id: string; name: string }>
  )
    .filter((t) => !linkedIds.has(t.id))
    .map((t) => ({ id: t.id, name: t.name }));

  const [resourceType, setResourceType] = useState<"board" | "repo" | "table">(
    "board",
  );
  const [resourceId, setResourceId] = useState("");
  const [relationship, setRelationship] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [rank, setRank] = useState("0");

  const candidates =
    resourceType === "board"
      ? boardCandidates
      : resourceType === "repo"
        ? repoCandidates
        : tableCandidates;

  const createLink = useCreateProjectResourceLink(projectId);

  const submit = () => {
    createLink.mutate(
      {
        id: projectId,
        resourceType,
        resourceId,
        relationship: relationship as "context" | "dependency" | "deliverable",
        label: label || null,
        note: note || null,
        rank: Number(rank),
      },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("projects:resources.addResource")}</DialogTitle>
          <DialogDescription>
            {t("projects:resources.emptyDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1">
            <span className="text-sm">
              {t("projects:resources.fields.resourceType")}
            </span>
            <select
              className="rounded-lg border border-input bg-background px-3 py-2"
              onChange={(e) => {
                setResourceType(e.target.value as "board" | "repo" | "table");
                setResourceId("");
              }}
              value={resourceType}
            >
              <option value="board">
                {t("projects:resources.types.board")}
              </option>
              <option value="repo">{t("projects:resources.types.repo")}</option>
              <option value="table">
                {t("projects:resources.types.table")}
              </option>
            </select>
          </div>

          <div className="grid gap-1">
            <span className="text-sm">
              {t("projects:resources.fields.resource")}
            </span>
            <select
              className="rounded-lg border border-input bg-background px-3 py-2"
              onChange={(e) => setResourceId(e.target.value)}
              value={resourceId}
            >
              <option value="">
                {t("projects:resources.validation.resourceRequired")}
              </option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1">
            <span className="text-sm">
              {t("projects:resources.fields.relationship")}
            </span>
            <select
              className="rounded-lg border border-input bg-background px-3 py-2"
              onChange={(e) => setRelationship(e.target.value)}
              value={relationship}
            >
              <option value="">
                {t("projects:resources.validation.relationshipRequired")}
              </option>
              <option value="context">
                {t("projects:resources.relationships.context")}
              </option>
              <option value="dependency">
                {t("projects:resources.relationships.dependency")}
              </option>
              <option value="deliverable">
                {t("projects:resources.relationships.deliverable")}
              </option>
            </select>
          </div>

          <div className="grid gap-1">
            <span className="text-sm">
              {t("projects:resources.fields.label")}
            </span>
            <Input
              onChange={(e) => setLabel(e.target.value)}
              nativeInput
              value={label}
            />
          </div>

          <div className="grid gap-1">
            <span className="text-sm">
              {t("projects:resources.fields.note")}
            </span>
            <Textarea onChange={(e) => setNote(e.target.value)} value={note} />
          </div>

          <div className="grid gap-1">
            <span className="text-sm">
              {t("projects:resources.fields.rank")}
            </span>
            <Input
              inputMode="numeric"
              nativeInput
              onChange={(e) => setRank(e.target.value)}
              type="number"
              value={rank}
            />
          </div>
        </div>

        <DialogFooter>
          <Button render={<DialogClose />} size="sm" variant="outline">
            {t("projects:actions.cancel")}
          </Button>
          <Button
            disabled={!resourceId || !relationship || createLink.isPending}
            onClick={submit}
            size="sm"
          >
            {t("projects:resources.addResource")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ProjectResourceLinkDialog;
