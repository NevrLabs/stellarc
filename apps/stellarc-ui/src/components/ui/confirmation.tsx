import { Terminal } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import type { ConfirmationElementProps } from "@/lib/agent-transcript";

/**
 * Confirmation (shadcn AI-elements recipe over Item + Button): asks for
 * approval before a tool runs. Once the person answers, the call becomes a
 * Tool line — this component only renders the pending question.
 */
export function Confirmation({
  title,
  description,
  options,
  icon,
  onDecide,
}: ConfirmationElementProps & {
  icon?: ReactNode;
  /** Called with the chosen optionId; the caller resolves the ACP request. */
  onDecide?: (optionId: string) => void;
}) {
  return (
    <Item variant="outline" size="sm" data-testid="confirmation">
      <ItemMedia variant="icon">{icon ?? <Terminal />}</ItemMedia>
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        {description ? <ItemDescription>{description}</ItemDescription> : null}
      </ItemContent>
      <ItemActions>
        {options.map((option) => (
          <Button
            key={option.optionId}
            size="sm"
            variant={option.variant}
            onClick={() => onDecide?.(option.optionId)}
          >
            {option.label}
          </Button>
        ))}
      </ItemActions>
    </Item>
  );
}
