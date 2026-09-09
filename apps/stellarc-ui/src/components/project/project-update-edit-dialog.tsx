import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ProjectUpdateComposer from "./project-update-composer";
export default function ProjectUpdateEditDialog({
  open,
  onClose,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit update</DialogTitle>
        </DialogHeader>
        <ProjectUpdateComposer projectId={projectId} />
      </DialogContent>
    </Dialog>
  );
}
