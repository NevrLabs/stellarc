import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import OrganizationLayout from "@/components/common/organization-layout";
import PageTitle from "@/components/page-title";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import usePermanentlyDeleteTask from "@/hooks/mutations/task/use-permanently-delete-task";
import useRestoreTask from "@/hooks/mutations/task/use-restore-task";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetTrashedTasks from "@/hooks/queries/task/use-get-trashed-tasks";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/trash",
)({
  component: TrashRouteComponent,
});

export type TrashedTaskRow = {
  id: string;
  title: string;
  number?: number | null;
  boardId?: string | null;
  boardName?: string | null;
  deletedAt?: string | Date | null;
  deletedBy?: string | null;
  deletedByName?: string | null;
};

function TrashRouteComponent() {
  const { organizationSlug } = Route.useParams();
  const { data: organization } = useActiveOrganization();
  const organizationId = organization?.id ?? "";

  return <TrashPage organizationId={organizationId} />;
}

/**
 * Recycle bin (#53). Lists soft-deleted tasks grouped by board with Restore and
 * an irreversible, confirmation-gated permanent delete.
 *
 * Exported separately from the route component so it can be rendered in tests
 * without a router: the route only supplies the organization id.
 */
export function TrashPage({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useGetTrashedTasks(organizationId);
  const { mutate: restore, isPending: isRestoring } = useRestoreTask();
  const { mutate: permanentlyDelete, isPending: isDeleting } =
    usePermanentlyDeleteTask();
  const [pendingDeletion, setPendingDeletion] = useState<TrashedTaskRow | null>(
    null,
  );

  const tasks = (data ?? []) as TrashedTaskRow[];

  // Group by board so an operator restoring a batch stays oriented; board id is
  // the key because two boards may share a name.
  const groups = new Map<string, { name: string; tasks: TrashedTaskRow[] }>();
  for (const task of tasks) {
    const key = task.boardId ?? "unknown";
    const existing = groups.get(key);
    if (existing) {
      existing.tasks.push(task);
    } else {
      groups.set(key, {
        name: task.boardName ?? t("trash:unknownBoard"),
        tasks: [task],
      });
    }
  }

  return (
    <OrganizationLayout title={t("trash:title")}>
      <PageTitle title={t("trash:title")} />
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/80 px-4 py-3">
          <h1 className="font-medium text-sm">{t("trash:title")}</h1>
          <span className="ml-auto text-muted-foreground text-xs">
            {t("trash:count", { count: tasks.length })}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">
              {t("trash:loading")}
            </p>
          ) : tasks.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("trash:empty")}</p>
          ) : (
            <div className="flex flex-col gap-4">
              {Array.from(groups.entries()).map(([boardId, group]) => (
                <section className="flex flex-col gap-1.5" key={boardId}>
                  <h2 className="font-medium text-muted-foreground text-xs uppercase">
                    {group.name}
                  </h2>
                  <ul className="flex flex-col divide-y divide-border/60 rounded-md border border-border/80">
                    {group.tasks.map((task) => (
                      <li
                        className="flex items-center gap-3 px-3 py-2.5 text-sm"
                        key={task.id}
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate" title={task.title}>
                            {task.title}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {t("trash:deletedMeta", {
                              when: task.deletedAt
                                ? formatDistanceToNow(
                                    new Date(task.deletedAt),
                                    {
                                      addSuffix: true,
                                    },
                                  )
                                : t("trash:unknownWhen"),
                              who:
                                task.deletedByName ??
                                task.deletedBy ??
                                t("trash:unknownUser"),
                            })}
                          </span>
                        </div>
                        <Button
                          disabled={isRestoring}
                          onClick={() => restore(task.id)}
                          size="sm"
                          variant="outline"
                        >
                          {t("trash:restore")}
                        </Button>
                        <Button
                          disabled={isDeleting}
                          onClick={() => setPendingDeletion(task)}
                          size="sm"
                          // Destructive styling: a ghost button read as plain
                          // text, so the irreversible action looked inert.
                          variant="destructive"
                        >
                          <Trash2 aria-hidden className="size-3.5" />
                          {t("trash:deletePermanently")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setPendingDeletion(null);
        }}
        open={!!pendingDeletion}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("trash:confirmDelete.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("trash:confirmDelete.description", {
                title: pendingDeletion?.title ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-sm">
              {t("trash:confirmDelete.cancel")}
            </AlertDialogClose>
            <AlertDialogClose
              className="inline-flex h-8 items-center justify-center rounded-md bg-destructive px-3 text-destructive-foreground text-sm"
              onClick={() => {
                if (pendingDeletion) permanentlyDelete(pendingDeletion.id);
                setPendingDeletion(null);
              }}
            >
              {t("trash:confirmDelete.confirm")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </OrganizationLayout>
  );
}
