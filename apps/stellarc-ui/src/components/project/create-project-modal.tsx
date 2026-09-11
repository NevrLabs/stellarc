import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import useCreateProject from "@/hooks/mutations/project/use-create-project";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetOrganizationMembers from "@/hooks/queries/organization-members/use-get-organization-members";
import { toast } from "@/lib/toast";

type CreateProjectModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * KFL-366: mirrors CreateBoardModal's shape (name entry, submit, error
 * toast), but requires name/summary/lead — Project has no execution
 * identity (no board key) to reserve here.
 */
function CreateProjectModal({ open, onClose }: CreateProjectModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [leadUserId, setLeadUserId] = useState("");

  const { data: organization } = useActiveOrganization();
  const organizationId = organization?.id ?? "";
  const { data: members } = useGetOrganizationMembers({ organizationId });
  const { mutateAsync, isPending } = useCreateProject();
  const navigate = useNavigate();

  const handleClose = () => {
    setName("");
    setSummary("");
    setLeadUserId("");
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !summary.trim() || !leadUserId) return;

    try {
      const created = await mutateAsync({
        organizationId,
        name,
        summary,
        leadUserId,
      });
      toast.success(t("projects:outcomes.createSuccess"));
      navigate({
        to: "/dashboard/organization/$organizationSlug/projects/$projectSlug",
        params: {
          organizationSlug: organization?.slug ?? "",
          projectSlug: created.slug,
        },
      });
      handleClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("projects:outcomes.error"),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("projects:actions.create")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("projects:overview.title")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <Input
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder={t("projects:labels.name")}
              required
              value={name}
            />
            <Input
              onChange={(e) => setSummary(e.target.value)}
              placeholder={t("projects:labels.summary")}
              required
              value={summary}
            />
            <Select onValueChange={setLeadUserId} value={leadUserId}>
              <SelectTrigger aria-label={t("projects:labels.lead")}>
                <SelectValue placeholder={t("projects:labels.lead")} />
              </SelectTrigger>
              <SelectContent>
                {members?.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.user?.name ?? member.user?.email ?? member.userId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button onClick={handleClose} type="button" variant="outline">
              {t("projects:actions.cancel")}
            </Button>
            <Button
              disabled={
                !name.trim() || !summary.trim() || !leadUserId || isPending
              }
              type="submit"
            >
              {isPending
                ? t("projects:actions.creating")
                : t("projects:actions.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateProjectModal;
