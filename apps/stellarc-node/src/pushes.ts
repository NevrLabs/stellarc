import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import type { Push } from "../../../packages/agents/src/protocol";

/** Push attribution collected from the harness workdir's git state (NEVR-199).
 * The node owns the workdir (D14); the plane never runs git. A push is a fact
 * git itself records durably: every `git push` appends an `update by push`
 * entry to the remote-tracking ref's reflog, with its own timestamp and the
 * pushed sha. The node snapshots each reflog's length before the harness
 * spawns and, at finish, attributes exactly the entries appended since —
 * count-based, so reflog timestamps being second-granular can never
 * misattribute a push that landed in the same clock second as the run start
 * (e.g. a fast retry), and a clone or fetch the harness did mid-run writes
 * different reflog messages and is never counted. No GitHub API at this stage
 * (the Kaneo-parity GitHub linkage owns that). */

const execFileAsync = promisify(execFile);

async function tryGit(
	cwd: string,
	args: ReadonlyArray<string>,
): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync("git", [...args], {
			cwd,
			maxBuffer: 8 * 1024 * 1024,
		});
		return stdout;
	} catch {
		return null;
	}
}

const FULL_SHA = /^[0-9a-f]{40}$/;
const PUSH_MARKER = "update by push";

/** Git repos whose pushes this workdir can produce: the workdir itself when
 * it is a repo, plus first-level subdirectories that are repos (the two ways
 * a harness checks out code: init at the root, or clone into a subdir).
 * Discovery is by `.git` presence only, so it can never crawl above the
 * workdir into the node's own repositories. */
async function repoCandidates(workdir: string): Promise<string[]> {
	const out: string[] = [];
	if (existsSync(join(workdir, ".git"))) out.push(workdir);
	let names: string[];
	try {
		names = (await readdir(workdir)).map((n) => n.toString());
	} catch {
		return out;
	}
	for (const name of names) {
		if (name.startsWith(".")) continue;
		const dir = join(workdir, name);
		if (existsSync(join(dir, ".git"))) out.push(dir);
	}
	return out;
}

/** Reflog entry count per (repo, remote-tracking ref) at run start. Empty when
 * the workdir holds no repos yet (first run — every push in it is new). */
export type PushBaseline = ReadonlyMap<string, number>;

const key = (repo: string, ref: string) => `${repo}\u0000${ref}`;

/** Read each remote-tracking ref's reflog length BEFORE the harness spawns. */
export async function snapshotPushState(
	workdir: string,
): Promise<PushBaseline> {
	const baseline = new Map<string, number>();
	for (const repo of await repoCandidates(workdir)) {
		for (const ref of await trackingRefs(repo)) {
			const log = await readReflog(repo, `logs/${ref}`);
			if (log) baseline.set(key(repo, ref), countEntries(log));
		}
	}
	return baseline;
}

/** Pushes appended to the reflogs since the baseline: one tuple per
 * `update by push` entry. Refs created after the baseline (mid-run clone)
 * start from count zero. */
export async function collectPushes(
	workdir: string,
	baseline: PushBaseline,
): Promise<Push[]> {
	const out: Push[] = [];
	for (const repo of await repoCandidates(workdir)) {
		const remotes = await listRemotes(repo);
		for (const ref of await trackingRefs(repo)) {
			const url = remotes.get(ref.split("/")[2] ?? "");
			if (!url) continue;
			const log = await readReflog(repo, `logs/${ref}`);
			if (!log) continue;
			const entries = log.split("\n").filter((l) => l.length > 0);
			for (const line of entries.slice(baseline.get(key(repo, ref)) ?? 0)) {
				const parsed = parseReflogLine(line);
				if (!parsed || parsed.message !== PUSH_MARKER) continue;
				out.push({
					commitSha: parsed.newSha,
					ref,
					remote: redactRemote(url),
					pushedAt: new Date(parsed.atSec * 1000).toISOString(),
				});
			}
		}
	}
	return out;
}

const countEntries = (log: string) =>
	log.split("\n").filter((l) => l.length > 0).length;

/** Strip userinfo (`user:pass@`, `token@`) from a remote URL before it leaves
 * the node: credentials a harness embedded in its remote URL never reach the
 * plane (D16 — the plane stores references, never values). Handles scheme
 * URLs (`https://user:tok@host/...`, `ssh://git@host/...`) and scp-style
 * (`user:pass@host:path`, `git@host:path`). */
export function redactRemote(url: string): string {
	return url
		.replace(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^@/]+@/, "$1")
		.replace(/^[^/@\s]+@(?=[^/]*:)/, "");
}

/** Raw reflog line: `<old> <new> <who> <email> <unix-ts> <tz>` TAB `<message>`. */
function parseReflogLine(line: string) {
	const [meta, message = ""] = line.split("\t");
	const parts = meta.trim().split(" ");
	if (parts.length < 6) return null;
	const newSha = parts[1];
	const atSec = Number(parts[parts.length - 2]);
	if (!FULL_SHA.test(newSha) || !Number.isFinite(atSec)) return null;
	return { newSha, atSec, message: message.trim() };
}

/** remote name → fetch URL. */
async function listRemotes(repo: string): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	const text = await tryGit(repo, ["remote", "-v"]);
	if (!text) return out;
	for (const line of text.split("\n")) {
		const m = line.match(/^([^\t]+)\t(\S+)\s+\(fetch\)$/);
		if (m) out.set(m[1], m[2]);
	}
	return out;
}

/** Remote-tracking refs of one repo (may be empty before the first push). */
async function trackingRefs(repo: string): Promise<string[]> {
	const refs = await tryGit(repo, [
		"for-each-ref",
		"refs/remotes/",
		"--format=%(refname)",
	]);
	if (!refs) return [];
	return refs.split("\n").filter((r) => r.length > 0);
}

/** Resolve a ref's reflog path via git plumbing (worktree-safe) and read it. */
async function readReflog(
	repo: string,
	logRef: string,
): Promise<string | null> {
	const path = await tryGit(repo, ["rev-parse", "--git-path", logRef]);
	if (!path) return null;
	const file = path.trim();
	if (!file) return null;
	try {
		return await readFile(isAbsolute(file) ? file : join(repo, file), "utf8");
	} catch {
		return null; // ref has no reflog (e.g. clone before first push)
	}
}
