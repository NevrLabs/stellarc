import { expect, test } from "vitest";
import {
	isSelfKillCommand,
	type SelfKillContext,
	TranscriptFolder,
} from "../../apps/stellarc-node/src/runner";

// NEVR-229 unit coverage for the pure self-kill guard and the interrupted
// transcript marker. The guard is pure — no process is ever signalled.

const ctx = (over: Partial<SelfKillContext> = {}): SelfKillContext => ({
	nodePid: 4242,
	harnessPid: 5252,
	harnessCommand: "/usr/local/bin/bun",
	...over,
});

const cmd = (command: string, c: SelfKillContext = ctx()) =>
	isSelfKillCommand("bash", { command }, c);

// ── matches (refuse) ────────────────────────────────────────────────────────

test("pid literals: kill/pkill naming the node or harness pid", () => {
	expect(cmd("kill 4242")).toBe(true);
	expect(cmd("kill -9 4242")).toBe(true);
	expect(cmd("kill -SIGHUP 4242")).toBe(true);
	expect(cmd("kill 5252")).toBe(true); // harness child
	expect(cmd("pkill 4242")).toBe(true);
	// Numbers ride in rawInput as numbers; with a kill verb they are caught.
	expect(isSelfKillCommand("bash", { verb: "kill", pid: 4242 }, ctx())).toBe(
		true,
	);
});

test("pkill -f patterns matching the node or harness cmdline", () => {
	expect(cmd("pkill -f stellarc")).toBe(true);
	expect(cmd("pkill -f stellarc-node")).toBe(true);
	expect(cmd("pkill -f /usr/local/bin/bun")).toBe(true); // harness full path
	expect(cmd("pkill -f bun")).toBe(true); // harness basename
	expect(cmd("pkill --full stellarc-node")).toBe(true);
});

test("killall/taskkill by process name", () => {
	expect(cmd("killall stellarc-node")).toBe(true);
	expect(cmd("killall bun")).toBe(true); // harness command word
	expect(cmd("taskkill /PID 4242")).toBe(true);
	expect(cmd("taskkill /PID 5252 /F")).toBe(true);
	expect(cmd("taskkill /IM stellarc-node.exe")).toBe(true);
});

test("supervisor-class commands, bare or under sudo", () => {
	const supervisors = [
		"shutdown",
		"shutdown -h now",
		"reboot",
		"halt",
		"poweroff",
		"init 0",
		"telinit 6",
	];
	for (const s of supervisors) {
		expect(cmd(s), s).toBe(true);
		expect(cmd(`sudo ${s}`)).toBe(true);
		expect(cmd(`sudo shutdown -h now`)).toBe(true);
	}
});

// ── defect 1 (NEVR-230): supervisor words as ARGUMENTS are benign ──────────

test("everyday subcommands of supervisor-named words pass (defect 1)", () => {
	// `init`/`reboot`/`halt` as arguments of another command: not supervisor
	// calls. The runner crashed routine agent work by refusing these.
	expect(cmd("git init")).toBe(false);
	expect(cmd("git init -b main")).toBe(false);
	expect(cmd("npm init -y")).toBe(false);
	expect(cmd("bun init")).toBe(false);
	expect(cmd("cargo init")).toBe(false);
	expect(cmd("terraform init")).toBe(false);
	expect(cmd("echo halt")).toBe(false);
	expect(cmd("echo reboot")).toBe(false);
	expect(cmd("ls init")).toBe(false);
	expect(cmd("npm run halt")).toBe(false);
	expect(cmd("git commit -m 'fix: reboot flow'")).toBe(false);
	expect(cmd("npm init")).toBe(false); // no runlevel operand
});

test("supervisor words after a shell separator still refuse", () => {
	expect(cmd("echo hi; reboot")).toBe(true);
	expect(cmd("echo hi && shutdown")).toBe(true);
	expect(cmd("ls || halt")).toBe(true);
	expect(cmd("true | poweroff")).toBe(true);
	expect(cmd("echo hi\nreboot")).toBe(true);
	expect(cmd("$(reboot)")).toBe(true);
	expect(cmd("echo `reboot`")).toBe(true);
	expect(cmd("echo done; sudo init 0")).toBe(true);
});

// ── defect 2 (NEVR-230): obvious self-kill forms must refuse ───────────────

test("kill on self-group sentinels and process-group ids refuses", () => {
	expect(cmd("kill $$")).toBe(true);
	expect(cmd("kill $PPID")).toBe(true);
	expect(cmd("kill 0")).toBe(true);
	expect(cmd("kill -9 0")).toBe(true);
	expect(cmd("kill -1")).toBe(true);
	expect(cmd("kill -- -1")).toBe(true);
	expect(cmd("kill -9 -5252")).toBe(true); // -<harnessPid> process group
	expect(cmd("kill -- -4242")).toBe(true); // -<nodePid> process group
	expect(cmd("kill -TERM 4242")).toBe(true); // still the plain pid form
});

test("command substitution resolving self pids refuses", () => {
	expect(cmd("kill $(pgrep -f stellarc)")).toBe(true);
	expect(cmd("kill -9 $(pidof stellarc-node)")).toBe(true);
	expect(cmd("kill `pgrep -f stellarc`")).toBe(true);
});

test("pipelines feeding self pids to kill refuse", () => {
	expect(
		cmd("ps aux | grep stellarc | awk '{print $2}' | xargs kill"),
	).toBe(true);
	expect(cmd("pgrep stellarc | xargs kill -9")).toBe(true);
});

test("service managers stopping the node/harness refuse", () => {
	expect(cmd("systemctl stop stellarc-node")).toBe(true);
	expect(cmd("systemctl stop stellarc-node.service")).toBe(true);
	expect(cmd("systemctl restart stellarc-node")).toBe(true);
	expect(cmd("sudo systemctl kill stellarc-node")).toBe(true);
	expect(cmd("service stellarc-node stop")).toBe(true);
	expect(cmd("supervisorctl restart stellarc")).toBe(true);
	expect(cmd("launchctl unload com.stellarc.node")).toBe(true);
});

test("service managers on unrelated units pass", () => {
	expect(cmd("systemctl stop nginx")).toBe(false);
	expect(cmd("systemctl restart postgresql")).toBe(false);
	expect(cmd("service docker stop")).toBe(false);
});

test("shell-wrapped self-kill", () => {
	expect(cmd("sh -c 'kill 4242'")).toBe(true);
	expect(cmd("bash -c pkill\\ -f\\ stellarc-node")).toBe(true);
});

test("deep rawInput shapes are walked", () => {
	expect(
		isSelfKillCommand(
			"bash",
			{ tool: { nested: { argv: ["kill", "4242"] } } },
			ctx(),
		),
	).toBe(true);
	expect(
		isSelfKillCommand(
			null,
			{ commands: [{ cmd: "pkill -f stellarc" }] },
			ctx(),
		),
	).toBe(true);
});

// ── non-matches (benign; must NOT over-block) ───────────────────────────────

test("benign commands pass", () => {
	expect(cmd("echo hi")).toBe(false);
	expect(cmd("ls -la")).toBe(false);
	expect(cmd("kill 9999")).toBe(false); // unrelated pid
	expect(cmd("kill -9 9998")).toBe(false);
	expect(cmd("pkill -f my-dev-server")).toBe(false);
	expect(cmd("killall firefox")).toBe(false);
	expect(cmd("pkill -f bundle")).toBe(false); // no 'bun' word-boundary match
	expect(cmd("taskkill /PID 9997")).toBe(false);
	expect(cmd("git status")).toBe(false);
	expect(cmd("npm run build")).toBe(false);
});

test("killall node is NOT self-kill on a shared host", () => {
	// The node's identity is stellarc-node, not the interpreter; a blanket
	// interpreter kill would over-block legitimate operator intent.
	expect(cmd("killall node")).toBe(false);
	expect(cmd("pkill node")).toBe(false);
});

test("no harness pid/command context still guards the node itself", () => {
	const bare: SelfKillContext = {
		nodePid: 4242,
		harnessPid: null,
		harnessCommand: null,
	};
	expect(cmd("kill 4242", bare)).toBe(true);
	expect(cmd("kill 5252", bare)).toBe(false); // unknown pid is not self
	expect(cmd("killall bun", bare)).toBe(false); // no harness identity known
	expect(cmd("pkill -f stellarc", bare)).toBe(true); // node name still matches
});

// ── TranscriptFolder interrupt marker ───────────────────────────────────────

test("an open chunk stream closed after markInterrupted carries the marker and reason", () => {
	const f = new TranscriptFolder();
	f.userPrompt("do it");
	f.update({
		sessionUpdate: "agent_message_chunk",
		content: { type: "text", text: "partial " },
	} as unknown as Parameters<typeof f.update>[0]);
	f.markInterrupted("operator_cancel");
	const items = f.take(true);
	const last = items[items.length - 1];
	expect(last.kind).toBe("message");
	expect((last.body as { role: string }).role).toBe("assistant");
	expect((last.body as { interrupted?: boolean }).interrupted).toBe(true);
	expect((last.body as { interruptReason?: string }).interruptReason).toBe(
		"operator_cancel",
	);
	expect((last.body as { content: { text: string }[] }).content[0].text).toBe(
		"partial ",
	);
});

test("markInterrupted with no open stream is a no-op", () => {
	const f = new TranscriptFolder();
	f.userPrompt("hi");
	f.markInterrupted("lease_lost");
	const items = f.take(true);
	expect(items).toHaveLength(1);
	expect(items[0].body).not.toHaveProperty("interrupted");
});

test("a normally-closed stream carries no marker", () => {
	const f = new TranscriptFolder();
	// Stream closes when the kind changes (usage_update) → later mark is a
	// no-op because nothing is open.
	f.update({
		sessionUpdate: "agent_message_chunk",
		content: { type: "text", text: "done" },
	} as unknown as Parameters<typeof f.update>[0]);
	f.update({
		sessionUpdate: "usage_update",
		used: 10,
		size: 100,
	} as unknown as Parameters<typeof f.update>[0]); // closes the stream
	f.markInterrupted("harness_exit");
	const items = f.take(true);
	const message = items.find((i) => i.kind === "message") as {
		body: Record<string, unknown>;
	};
	expect(message.body).not.toHaveProperty("interrupted");
});
