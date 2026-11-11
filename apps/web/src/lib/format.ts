/** "2026-11-04" → "Nov 4" (en-US, matching the mockup). */
export function fmtDate(iso: string): string {
	return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

export function isoOf(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
		date.getDate(),
	).padStart(2, "0")}`;
}
