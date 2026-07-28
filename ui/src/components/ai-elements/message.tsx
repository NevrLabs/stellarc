import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ComponentProps, HTMLAttributes } from "react";

export type MessageProps = HTMLAttributes<HTMLDivElement> & { from: "user" | "assistant" | "system" };
export const Message = ({ className, from, ...props }: MessageProps) => <div className={cn("group flex w-full max-w-[95%] flex-col gap-2", from === "user" ? "is-user ml-auto" : "is-assistant", className)} {...props} />;
export const MessageContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => <div className={cn("flex min-w-0 max-w-full flex-col gap-2", className)} {...props} />;
export const MessageActions = ({ className, ...props }: ComponentProps<"div">) => <div className={cn("flex items-center gap-1", className)} {...props} />;
export const MessageAction = ({ tooltip, label, children, ...props }: ComponentProps<typeof Button> & { tooltip?: string; label?: string }) => {
  const button = <Button type="button" variant="ghost" size="icon-sm" aria-label={label ?? tooltip} {...props}>{children}</Button>;
  return tooltip ? <Tooltip><TooltipTrigger render={button} /><TooltipContent>{tooltip}</TooltipContent></Tooltip> : button;
};
export const MessageToolbar = ({ className, ...props }: ComponentProps<"div">) => <div className={cn("mt-4 flex w-full items-center justify-between gap-4", className)} {...props} />;
