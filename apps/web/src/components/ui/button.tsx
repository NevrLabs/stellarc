import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export type ButtonVariant = "default" | "ghost" | "primary";
export type ButtonSize = "md" | "sm";

const variantClasses: Record<ButtonVariant, string> = {
	default: "btn",
	ghost: "btn ghost",
	primary: "btn pri",
};

const sizeClasses: Record<ButtonSize, string> = {
	md: "",
	sm: "sm",
};

/** shadcn-style Button over the ported `.btn` token classes (Base UI variant). */
export function Button({
	variant = "default",
	size = "md",
	className,
	...props
}: ComponentProps<"button"> & {
	variant?: ButtonVariant;
	size?: ButtonSize;
}) {
	return (
		<button
			type="button"
			className={cn(variantClasses[variant], sizeClasses[size], className)}
			{...props}
		/>
	);
}
