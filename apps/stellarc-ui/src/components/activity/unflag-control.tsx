import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import useResolveTaskFlag from "@/hooks/mutations/flag/use-resolve-task-flag";
import { toast } from "@/lib/toast";

type UnflagControlProps = {
  flagId: string;
  taskId: string;
};

/**
 * #107: "Make the Unflag button more obvious. it should be under the active
 * flag or something. make it use the highlighed button style too." plus
 * "make it a simple text field and make it mandatory ... it says Notes. it's
 * mandatory to be filled to unflag the flag."
 *
 * So this renders on its own row beneath the flag entry (not inline in the
 * sentence), uses the default/highlighted button variant, and keeps the button
 * disabled until a note is typed. The API enforces the same rule.
 */
export default function UnflagControl({ flagId, taskId }: UnflagControlProps) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const { mutate: resolveTaskFlag, isPending } = useResolveTaskFlag();

  const trimmed = note.trim();
  const canUnflag = trimmed.length > 0 && !isPending;

  const submit = (event: { preventDefault?: () => void }) => {
    event.preventDefault?.();
    if (!canUnflag) return;

    resolveTaskFlag(
      { flagId, taskId, resolveNote: trimmed },
      {
        onSuccess: () => setNote(""),
        onError: (error: unknown) =>
          toast.error(
            error instanceof Error
              ? error.message
              : t("flags:dialog.unflagFailed"),
          ),
      },
    );
  };

  return (
    <form
      data-testid={`unflag-control-${flagId}`}
      onSubmit={submit}
      className="mt-1.5 flex items-center gap-2"
    >
      <Input
        aria-label={t("flags:dialog.resolveNote")}
        placeholder={t("flags:dialog.resolveNote")}
        data-testid={`unflag-note-${flagId}`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        className="h-8 max-w-64"
        required
      />
      <Button
        type="submit"
        size="sm"
        data-testid={`unflag-submit-${flagId}`}
        disabled={!canUnflag}
        className="h-8"
      >
        {t("flags:dialog.unflag")}
      </Button>
    </form>
  );
}
