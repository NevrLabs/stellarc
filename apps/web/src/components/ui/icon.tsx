import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { ICONS } from "@/lib/icons";

/**
 * Mockup's `svg.i`: 16px icon, 14px when small, stroke 1.75, flex:none,
 * aria-hidden. Pass a fixture icon name ("inbox", "kanban-square", …).
 */
export function Ico({
	n,
	sm,
	flip,
	className,
}: {
	n: string;
	sm?: boolean;
	flip?: boolean;
	className?: string;
}) {
	const Comp: LucideIcon | undefined = ICONS[n];
	if (!Comp) return null;
	return (
		<Comp
			size={sm ? 14 : 16}
			strokeWidth={1.75}
			aria-hidden="true"
			className={cn("flex-none", flip && "rotate-180", className)}
		/>
	);
}
