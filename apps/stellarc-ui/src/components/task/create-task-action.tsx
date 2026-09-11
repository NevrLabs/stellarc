import { Plus } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";

const CreateTaskModal = lazy(
  () => import("@/components/shared/modals/create-task-modal"),
);

export default function CreateTaskAction({
  boardId,
  status,
}: {
  boardId: string;
  status?: "planned";
}) {
  const { t } = useTranslation();
  const { canCreateTasks } = useOrganizationPermission();
  const [open, setOpen] = useState(false);
  const label = t("navigation:commandPalette.createTask");

  if (!canCreateTasks()) return null;

  return (
    <>
      <Button
        type="button"
        size="xs"
        className="h-7 gap-1.5 px-2"
        aria-label={label}
        data-testid="board-create-task"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3.5" />
        <span className="hidden sm:inline">{label}</span>
      </Button>
      {open ? (
        <Suspense fallback={<span className="sr-only">Loading editor</span>}>
          <CreateTaskModal
            open
            boardId={boardId}
            status={status}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      ) : null}
    </>
  );
}
