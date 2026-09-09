import { useTranslation } from "react-i18next";
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

type ArchiveProjectDialogProps = {
  open: boolean;
  projectName: string;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ArchiveProjectDialog({
  open,
  projectName,
  isPending,
  onConfirm,
  onClose,
}: ArchiveProjectDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => !next && !isPending && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("projects:actions.archiveTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("projects:actions.archiveDescription", { name: projectName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            disabled={isPending}
            render={<AlertDialogClose />}
            size="sm"
            variant="outline"
          >
            {t("projects:actions.cancel")}
          </Button>
          <Button disabled={isPending} onClick={onConfirm} size="sm">
            {t("projects:actions.confirmArchive")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ArchiveProjectDialog;
