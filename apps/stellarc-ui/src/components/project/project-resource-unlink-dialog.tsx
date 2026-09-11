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

type ProjectResourceUnlinkDialogProps = {
  open: boolean;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * KFL-368: unlink confirmation. Removing the association row only — the
 * Resource is never mutated.
 */
export function ProjectResourceUnlinkDialog({
  open,
  isPending,
  onConfirm,
  onClose,
}: ProjectResourceUnlinkDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => !next && !isPending && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("projects:resources.unlinkTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("projects:resources.unlinkDescription")}
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
          <Button
            disabled={isPending}
            onClick={onConfirm}
            size="sm"
            variant="destructive"
          >
            {t("projects:resources.confirmUnlink")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ProjectResourceUnlinkDialog;
