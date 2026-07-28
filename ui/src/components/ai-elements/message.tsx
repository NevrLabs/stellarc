import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ComponentProps, HTMLAttributes } from "react";

export type MessageProps = HTMLAttributes<HTMLDivElement> & { from: "user" | "assistant" | "system" };
export const Message = ({ className, from: _from, ...props }: MessageProps) => <div className={className} {...props} />;
export const MessageContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => <>{props.children}</>;
export const MessageActions = ({ className, ...props }: ComponentProps<"div">) => <div className={cn("flex items-center gap-1", className)} {...props} />;
export const MessageAction = ({ tooltip, label, children, ...props }: ComponentProps<typeof Button> & { tooltip?: string; label?: string }) => (
  <Button type="button" variant="ghost" size="icon-sm" aria-label={label ?? tooltip} title={tooltip} {...props}>{children}</Button>
);
export const MessageToolbar = ({ className, ...props }: ComponentProps<"div">) => <div className={className} {...props} />;
