import type { RunPermissionOption, RunPermissionRequest } from "./types";

/** Props the Confirmation element renders (Item + Buttons composition). */
export interface ConfirmationElementProps {
  /** "Run <tool>?" question line. */
  title: string;
  /** Secondary context: what running the tool would do. */
  description: string | null;
  /** Options the deciding human may pick, in protocol order. */
  options: Array<{
    optionId: string;
    label: string;
    variant: "default" | "outline";
  }>;
  /** The request's tool call id, echoed on the decision callback. */
  toolCallId: string;
}

const buttonVariantFor = (
  kind: RunPermissionOption["kind"],
): "default" | "outline" => {
  // Allow actions are affirmative (filled); rejects/denies stay outline.
  return kind.startsWith("allow") ? "default" : "outline";
};

/**
 * Map a permission request (NEVR-198 approval item / ACP
 * session/request_permission) to Confirmation element props. Option order is
 * the protocol's; labels are the option names the harness reported.
 */
export function toConfirmationElementProps(
  request: RunPermissionRequest,
): ConfirmationElementProps {
  const what = request.title ?? request.toolName ?? "this tool";
  return {
    title: `Run ${what}?`,
    description: request.toolName
      ? `The command runs as ${request.toolName} in this workspace.`
      : null,
    options: request.options.map((option) => ({
      optionId: option.optionId,
      label: option.name,
      variant: buttonVariantFor(option.kind),
    })),
    toolCallId: request.toolCallId,
  };
}
