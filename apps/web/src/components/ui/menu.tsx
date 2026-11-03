import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * shadcn-style dropdown menu on Base UI. Tokens only — the popup is
 * `--raised` over `--line-strong` with the mockup's shadow.
 */
export function Menu({
	trigger,
	triggerClassName,
	children,
	align = "start",
}: {
	trigger: ReactNode;
	triggerClassName?: string;
	children: ReactNode;
	align?: "start" | "end";
}) {
	return (
		<BaseMenu.Root>
			<BaseMenu.Trigger className={triggerClassName}>
				{trigger}
			</BaseMenu.Trigger>
			<BaseMenu.Portal>
				<BaseMenu.Positioner align={align} sideOffset={6} className="z-50">
					<BaseMenu.Popup
						className={cn(
							"min-w-44 rounded-md border border-line-strong bg-raised p-1",
							"shadow-[var(--shadow)]",
						)}
					>
						{children}
					</BaseMenu.Popup>
				</BaseMenu.Positioner>
			</BaseMenu.Portal>
		</BaseMenu.Root>
	);
}

export function MenuItem({
	children,
	onClick,
	selected,
}: {
	children: ReactNode;
	onClick?: () => void;
	selected?: boolean;
}) {
	return (
		<BaseMenu.Item
			onClick={onClick}
			className={cn(
				"flex h-row cursor-default items-center gap-2 rounded-sm px-2 text-dim",
				"data-[highlighted]:bg-hover data-[highlighted]:text-fg",
				selected && "text-fg",
			)}
		>
			{children}
		</BaseMenu.Item>
	);
}

export function MenuSeparator() {
	return <BaseMenu.Separator className="my-1 h-px bg-line" />;
}
