import {
  type ConfirmationElementProps,
  toConfirmationElementProps,
} from "./confirmation";
import type { RunPermissionRequest } from "./types";

/** Props the ApprovalCard element renders. */
export interface ApprovalCardElementProps {
  /** Sticky-card status: preparing (request not reported yet) or ready. */
  status: "preparing" | "ready";
  /** The Confirmation question + protocol options (folded, not forked). */
  confirmation: ConfirmationElementProps | null;
  /** Key the answer seam resolves on: the request's tool call id. */
  toolCallId: string | null;
}

/**
 * Map a pending permission request (NEVR-198 approval item / ACP
 * session/request_permission) to ApprovalCard props: the question card
 * wraps #108's Confirmation mapping — the card owns placement (sticky,
 * popover surface) and the preparing state, Confirmation owns the
 * question and the choices. Fold, not fork.
 */
export function toApprovalCardElementProps(
  request: RunPermissionRequest | null | undefined,
): ApprovalCardElementProps {
  if (!request) {
    return { status: "preparing", confirmation: null, toolCallId: null };
  }
  return {
    status: "ready",
    confirmation: toConfirmationElementProps(request),
    toolCallId: request.toolCallId,
  };
}
