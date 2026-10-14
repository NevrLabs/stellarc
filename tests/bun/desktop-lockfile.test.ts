import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * NEVR-191 — desktop/Cargo.lock is committed. Before it existed, every fresh
 * CI runner re-resolved `tauri = "2"` to whatever 2.x was newest on crates.io,
 * so desktop builds were not reproducible and rust-cache (keyed on the
 * lockfile) de-diffed between runs. This gate fails if the lockfile is
 * deleted, untracked, or stops pinning the Tauri 2.x line the manifest floats.
 */

const repoRoot = join(import.meta.dir, "..", "..");
const lockPath = join(repoRoot, "desktop", "Cargo.lock");

function pinnedVersion(lock: string, name: string): string | undefined {
	return [
		...lock.matchAll(
			/\[\[package\]\]\s*\nname = "([^"]+)"\nversion = "([^"]+)"/g,
		),
	]
		.filter((m) => m[1] === name)
		.map((m) => m[2])[0];
}

test("desktop/Cargo.lock is committed and pins tauri 2.x", () => {
	expect(existsSync(lockPath)).toBe(true);
	const lock = readFileSync(lockPath, "utf8");

	for (const crate of ["tauri", "tauri-build", "tauri-plugin-shell"]) {
		const version = pinnedVersion(lock, crate);
		expect(
			version,
			`${crate} must be pinned in desktop/Cargo.lock`,
		).toBeDefined();
		expect(
			version?.startsWith("2."),
			`${crate} pinned to 2.x, got ${version}`,
		).toBeTrue();
	}
});
