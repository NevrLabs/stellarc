import { Button } from "@/components/ui/button";
import ProjectHealthBadge, { type ProjectHealth } from "./project-health-badge";

export type ProjectUpdate = {
  id: string;
  authorId: string;
  authorName: string | null;
  content: string;
  health: ProjectHealth;
  createdAt: string | Date;
  updatedAt: string | Date;
};
export default function ProjectUpdateRow({
  update,
  canEdit,
  onEdit,
  onDelete,
}: {
  update: ProjectUpdate;
  canEdit?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <article
      className="space-y-2 border-b border-border p-4 last:border-0"
      data-testid="project-update-row"
    >
      <div className="flex flex-wrap items-center gap-2">
        <ProjectHealthBadge health={update.health} />
        <span className="text-sm text-muted-foreground">
          {update.authorName ?? "Unknown"}
        </span>
        <time className="text-xs text-muted-foreground">
          {new Date(update.createdAt).toLocaleDateString()}
        </time>
        {canEdit && (
          <span className="ml-auto flex gap-1">
            <Button size="sm" variant="ghost" onClick={onEdit}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete}>
              Delete
            </Button>
          </span>
        )}
      </div>
      <p className="whitespace-pre-wrap">{update.content}</p>
    </article>
  );
}
