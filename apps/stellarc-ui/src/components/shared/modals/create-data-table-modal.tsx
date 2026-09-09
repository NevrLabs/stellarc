import { useNavigate } from "@tanstack/react-router";
import { Table2 } from "lucide-react";
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
import { useDataTableMutations } from "@/hooks/data-table/use-data-tables";
import { toast } from "@/lib/toast";

type Props = {
  open: boolean;
  onClose: () => void;
  organizationId: string;
};

export default function CreateDataTableModal({
  open,
  onClose,
  organizationId,
}: Props) {
  const [name, setName] = useState("");
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { createTable } = useDataTableMutations(organizationId);

  const close = () => {
    setName("");
    onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      const table = await createTable.mutateAsync({
        organizationId,
        name: name.trim(),
      });
      toast.success(t("navigation:tables.created"));
      close();
      navigate({
        to: "/dashboard/organization/$organizationSlug/table/$tableId",
        params: { organizationSlug: organizationId, tableId: table.id },
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("navigation:tables.createError"),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader className="gap-2">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Table2 className="size-5" />
          </div>
          <DialogTitle>{t("navigation:tables.createTitle")}</DialogTitle>
          <DialogDescription>
            {t("navigation:tables.createDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("navigation:tables.tableName")}
            aria-label={t("navigation:tables.tableName")}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {t("navigation:tables.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || createTable.isPending}
            >
              {createTable.isPending
                ? t("navigation:tables.creating")
                : t("navigation:tables.createAction")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
