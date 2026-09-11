import { Link } from "@tanstack/react-router";
import { Database, Github, LayoutGrid, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type ProjectResourceLinkData = {
  id: string;
  projectId: string;
  resourceType: "board" | "repo" | "table";
  resourceId: string;
  relationship: "context" | "dependency" | "deliverable";
  label: string | null;
  note: string | null;
  rank: number;
  resource: {
    id: string;
    name: string;
    slug?: string | null;
  };
};

const TYPE_ICON = {
  board: LayoutGrid,
  repo: Github,
  table: Database,
} as const;

type ProjectResourceRowProps = {
  link: ProjectResourceLinkData;
  organizationSlug: string;
  canEdit: boolean;
  onEdit: () => void;
  onUnlink: () => void;
};

/**
 * KFL-368: one contextual resource row. Type icon, safe name (linked to the
 * canonical Resource route), relationship badge, optional label/note. Edit and
 * unlink controls render only with Project update capability — viewing a link
 * never implies target edit rights.
 */
export function ProjectResourceRow({
  link,
  organizationSlug,
  canEdit,
  onEdit,
  onUnlink,
}: ProjectResourceRowProps) {
  const { t } = useTranslation();
  const Icon = TYPE_ICON[link.resourceType];

  const to =
    link.resourceType === "board"
      ? "/dashboard/organization/$organizationSlug/board/$boardSlug"
      : link.resourceType === "repo"
        ? "/dashboard/organization/$organizationSlug/repo/$repoId"
        : "/dashboard/organization/$organizationSlug/table/$tableId";

  const params =
    link.resourceType === "board"
      ? { organizationSlug, boardSlug: link.resource.slug ?? link.resourceId }
      : {
          organizationSlug,
          [link.resourceType === "repo" ? "repoId" : "tableId"]:
            link.resourceId,
        };

  return (
    <li
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-1.5"
      data-testid="project-resource-row"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <Link
        className="min-w-0 truncate font-medium text-foreground hover:underline"
        params={params}
        to={to}
      >
        {link.resource.name}
      </Link>
      <Badge size="sm" variant="secondary">
        {t(`projects:resources.relationships.${link.relationship}`)}
      </Badge>
      {link.label && (
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {link.label}
        </span>
      )}
      {link.note && (
        <span className="w-full min-w-0 truncate text-xs text-muted-foreground/72 sm:w-auto">
          {link.note}
        </span>
      )}
      {canEdit && (
        <span className="ms-auto flex shrink-0 items-center gap-1">
          <Button
            aria-label={t("projects:resources.editLink")}
            onClick={onEdit}
            size="sm"
            variant="ghost"
          >
            <Pencil />
          </Button>
          <Button
            aria-label={t("projects:resources.unlink")}
            onClick={onUnlink}
            size="sm"
            variant="ghost"
          >
            <Trash2 />
          </Button>
        </span>
      )}
    </li>
  );
}

export default ProjectResourceRow;
