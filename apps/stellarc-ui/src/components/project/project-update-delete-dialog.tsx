import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import useDeleteProjectUpdate from "@/hooks/mutations/project/use-delete-project-update";
export default function ProjectUpdateDeleteDialog({
  open,
  onClose,
  projectId,
  updateId,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  updateId: string;
}) {
  const mutation = useDeleteProjectUpdate();
  const remove = async () => {
    await mutation.mutateAsync({ id: projectId, updateId });
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete update?</DialogTitle>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={remove}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
