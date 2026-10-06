/* biome-ignore-all lint/suspicious/noConsole: CLI parity report */
/**
 * Parity harness: drive the Effect-native Kaneo endpoints and the lifted
 * legacy tree with the same requests against the same database, and compare
 * status + JSON. Native: STELLARC_KANEO=on (default). Legacy: a second host
 * with STELLARC_KANEO_NATIVE=off.
 *
 * usage: bun tools/kaneo-parity.ts <nativeBase> <legacyBase> <cookieJar> <orgId>
 */
export type ParityRow = {
	name: string;
	native: number;
	legacy: number;
	ok: boolean;
	diff?: { native: string; legacy: string };
};

export async function runParity(
	nativeBase: string,
	legacyBase: string,
	cookie: string,
	org: string,
): Promise<ParityRow[]> {
	const headers = {
		cookie,
		"content-type": "application/json",
		origin: "http://localhost:5273",
	};

	type Step = {
		name: string;
		method: string;
		path: (ctx: Record<string, string>) => string;
		body?: (ctx: Record<string, string>) => unknown;
		capture?: (json: unknown, ctx: Record<string, string>) => void;
		anon?: boolean;
	};

	// Volatile values differ between the two runs by construction.
	const VOLATILE = new Set([
		"id",
		"createdAt",
		"updatedAt",
		"archivedAt",
		"boardId",
		"slug",
		"name",
	]);
	const normalize = (v: unknown): unknown => {
		if (Array.isArray(v)) return v.map(normalize);
		if (v && typeof v === "object")
			return Object.fromEntries(
				Object.entries(v as Record<string, unknown>)
					.sort(([a], [b]) => a.localeCompare(b))
					.map(([k, x]) => [
						k,
						k === "name" && typeof x === "string"
							? x.replace(/Parity [nl]\d+/, "Parity <tag>")
							: VOLATILE.has(k) && k !== "name"
								? typeof x
								: normalize(x),
					]),
			);
		return v;
	};

	const steps = (tag: string): Step[] => [
		{
			name: "list boards",
			method: "GET",
			path: () => `/api/board?organizationId=${org}`,
		},
		{
			name: "list (archived)",
			method: "GET",
			path: () => `/api/board?organizationId=${org}&includeArchived=true`,
		},
		{
			name: "list unauthenticated",
			method: "GET",
			path: () => `/api/board?organizationId=${org}`,
			anon: true,
		},
		{
			name: "list foreign org",
			method: "GET",
			path: () => "/api/board?organizationId=nope",
		},
		{
			name: "create board",
			method: "POST",
			path: () => "/api/board",
			body: () => ({
				name: `Parity ${tag}`,
				organizationId: org,
				icon: "Layout",
				slug: `parity-${tag}`,
			}),
			capture: (j, c) => {
				c.board = (j as { id: string }).id;
			},
		},
		{
			name: "create board (bad body)",
			method: "POST",
			path: () => "/api/board",
			body: () => ({ name: 1 }),
		},
		{ name: "get board", method: "GET", path: (c) => `/api/board/${c.board}` },
		{
			name: "get missing board",
			method: "GET",
			path: () => "/api/board/does-not-exist",
		},
		{
			name: "update board",
			method: "PUT",
			path: (c) => `/api/board/${c.board}`,
			body: () => ({
				name: `Parity ${tag} v2`,
				icon: "Box",
				slug: `parity-${tag}`,
				description: "d",
				isPublic: false,
				subtaskDepthLimit: 3,
			}),
		},
		{
			name: "update board (depth out of range)",
			method: "PUT",
			path: (c) => `/api/board/${c.board}`,
			body: () => ({
				name: "x",
				icon: "Box",
				slug: "x",
				description: "",
				isPublic: false,
				subtaskDepthLimit: 9,
			}),
		},
		{
			name: "list columns",
			method: "GET",
			path: (c) => `/api/column/${c.board}`,
		},
		{
			name: "create column",
			method: "POST",
			path: (c) => `/api/column/${c.board}`,
			body: () => ({ name: "QA Lane", color: "#ff0" }),
			capture: (j, c) => {
				c.column = (j as { id: string }).id;
			},
		},
		{
			name: "create duplicate column",
			method: "POST",
			path: (c) => `/api/column/${c.board}`,
			body: () => ({ name: "QA Lane" }),
		},
		{
			name: "create symbol-only column",
			method: "POST",
			path: (c) => `/api/column/${c.board}`,
			body: () => ({ name: "!!!" }),
		},
		{
			name: "update column",
			method: "PUT",
			path: (c) => `/api/column/${c.column}`,
			body: () => ({ name: "QA", isFinal: true }),
		},
		{
			name: "delete column",
			method: "DELETE",
			path: (c) => `/api/column/${c.column}`,
		},
		{
			name: "archive board",
			method: "PUT",
			path: (c) => `/api/board/${c.board}/archive`,
		},
		{
			name: "unarchive board",
			method: "PUT",
			path: (c) => `/api/board/${c.board}/unarchive`,
		},
		{
			name: "delete board",
			method: "DELETE",
			path: (c) => `/api/board/${c.board}`,
		},
	];

	async function _run(base: string, tag: string) {
		const ctx: Record<string, string> = {};
		const out: Array<{ name: string; status: number; body: unknown }> = [];
		for (const s of steps(tag)) {
			const res = await fetch(base + s.path(ctx), {
				method: s.method,
				headers: s.anon ? { "content-type": "application/json" } : headers,
				body: s.body ? JSON.stringify(s.body(ctx)) : undefined,
			});
			const text = await res.text();
			let body: unknown = text;
			try {
				body = JSON.parse(text);
			} catch {}
			if (res.ok && s.capture) s.capture(body, ctx);
			out.push({ name: s.name, status: res.status, body });
		}
		return out;
	}

	// Interleave per step so both hosts observe the same database state: a
	// board created by one host's run must not leak into the other's list.
	async function interleaved() {
		const ctxN: Record<string, string> = {};
		const ctxL: Record<string, string> = {};
		const tagN = `n${Date.now() % 100000}`;
		const tagL = `l${Date.now() % 100000}`;
		const sN = steps(tagN);
		const sL = steps(tagL);
		const n: Array<{ name: string; status: number; body: unknown }> = [];
		const l: typeof n = [];
		const one = async (base: string, s: Step, ctx: Record<string, string>) => {
			const res = await fetch(base + s.path(ctx), {
				method: s.method,
				headers: s.anon ? { "content-type": "application/json" } : headers,
				body: s.body ? JSON.stringify(s.body(ctx)) : undefined,
			});
			const text = await res.text();
			let body: unknown = text;
			try {
				body = JSON.parse(text);
			} catch {}
			if (res.ok && s.capture) s.capture(body, ctx);
			return { name: s.name, status: res.status, body };
		};
		for (let i = 0; i < sN.length; i++) {
			// list steps: read both before either side mutates
			n.push(await one(nativeBase, sN[i], ctxN));
			l.push(await one(legacyBase, sL[i], ctxL));
		}
		return { n, l };
	}
	void _run;
	const { n, l } = await interleaved();
	const rows: ParityRow[] = [];
	for (let i = 0; i < n.length; i++) {
		const sameStatus = n[i].status === l[i].status;
		const a = JSON.stringify(normalize(n[i].body));
		const b = JSON.stringify(normalize(l[i].body));
		const okBody = n[i].status >= 400 || a === b;
		rows.push({
			name: n[i].name,
			native: n[i].status,
			legacy: l[i].status,
			ok: sameStatus && okBody,
			...(okBody
				? {}
				: { diff: { native: a.slice(0, 400), legacy: b.slice(0, 400) } }),
		});
	}
	return rows;
}

if (import.meta.main) {
	const [nativeBase, legacyBase, jar, org] = process.argv.slice(2);
	const cookie = (await Bun.file(jar).text())
		.split("\n")
		.map((l) => l.replace(/^#HttpOnly_/, ""))
		.filter((l) => l && !l.startsWith("#"))
		.map((l) => l.split("\t"))
		.filter((p) => p.length >= 7)
		.map((p) => `${p[5]}=${p[6]}`)
		.join("; ");
	const rows = await runParity(nativeBase, legacyBase, cookie, org);
	for (const r of rows) {
		console.log(
			`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(36)} native=${r.native} legacy=${r.legacy}`,
		);
		if (r.diff)
			console.log("   native:", r.diff.native, "\n   legacy:", r.diff.legacy);
	}
	const passed = rows.filter((r) => r.ok).length;
	console.log(`\n${passed}/${rows.length} parity`);
	process.exit(passed === rows.length ? 0 : 1);
}
