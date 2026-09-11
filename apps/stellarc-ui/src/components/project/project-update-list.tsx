import ProjectUpdateRow, { type ProjectUpdate } from "./project-update-row";
export default function ProjectUpdateList({
  updates,
  canEdit,
  onEdit,
  onDelete,
}: {
  updates: ProjectUpdate[];
  canEdit?: boolean;
  onEdit?: (u: ProjectUpdate) => void;
  onDelete?: (u: ProjectUpdate) => void;
}) {
  return (
    <div data-testid="project-update-list">
      {updates.map((u) => (
        <ProjectUpdateRow
          key={u.id}
          update={u}
          canEdit={canEdit}
          onEdit={() => onEdit?.(u)}
          onDelete={() => onDelete?.(u)}
        />
      ))}
    </div>
  );
}
