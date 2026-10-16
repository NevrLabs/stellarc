import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import { Confirmation } from "@/components/ui/confirmation";
import type { ApprovalCardElementProps } from "@/lib/agent-transcript";

/**
 * ApprovalCard (UX shape stolen from the chatbot template's question-card,
 * built on in-tree Base UI-era primitives): the sticky, actionable prompt
 * for a *pending* permission request. The inline transcript record is
 * #108's Confirmation element — this card folds it in rather than forking
 * it: the card owns placement (sticky bottom, popover surface) and the
 * preparing state; Confirmation owns the question and the choices.
 * Policy is not decided here — NEVR-198's pipeline owns that; the card
 * just invokes the answer callback keyed by toolCallId.
 */
export function ApprovalCard({
  status,
  confirmation,
  toolCallId,
  icon,
  onAnswer,
}: ApprovalCardElementProps & {
  /** Media icon for the request line (defaults to the terminal). */
  icon?: ReactNode;
  /**
   * Called with the request's toolCallId and the chosen optionId; the
   * caller resolves the ACP session/request_permission request.
   */
  onAnswer?: (toolCallId: string, optionId: string) => void;
}) {
  return (
    <div className="sticky bottom-2 isolate z-50 mx-auto w-full max-w-2xl px-6 pt-2">
      <div
        data-testid="approval-card"
        className="w-full rounded-3xl bg-popover p-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10"
      >
        {status === "preparing" || !confirmation ? (
          <div className="flex shimmer items-center gap-2 py-2 text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            Preparing a question…
          </div>
        ) : (
          <Confirmation
            key={toolCallId ?? confirmation.toolCallId}
            {...confirmation}
            icon={icon}
            onDecide={
              onAnswer && toolCallId
                ? (optionId) => onAnswer(toolCallId, optionId)
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
