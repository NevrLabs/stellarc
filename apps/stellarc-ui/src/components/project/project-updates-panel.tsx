import useGetProjectUpdates from "@/hooks/queries/project/use-get-project-updates";
import ProjectUpdateComposer from "./project-update-composer";
import ProjectUpdateList from "./project-update-list";
export default function ProjectUpdatesPanel({
  projectId,
}: {
  projectId: string;
}) {
  const { data, isLoading } = useGetProjectUpdates({ projectId });
  const updates = data ?? [];
  return (
    <div className="space-y-6 p-4" data-testid="project-updates-panel">
      <ProjectUpdateComposer projectId={projectId} />
      {isLoading ? (
        <p>Loading updates…</p>
      ) : updates.length === 0 ? (
        <p className="text-muted-foreground">No updates yet.</p>
      ) : (
        <ProjectUpdateList updates={updates} />
      )}
    </div>
  );
}
