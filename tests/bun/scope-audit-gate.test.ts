import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import {
	BOUNDED_CURSORS,
	REDIRECT_SAFE,
} from "../../packages/contracts/src/scope";
import {
	type AuditRoute,
	auditRoutes,
	isCursorFieldName,
	isRedirectFieldName,
	isSecretFieldName,
	isServerDerivedFieldName,
	staleRows,
} from "../../packages/contracts/src/scope-audit";

/**
 * NEVR-603 — scope-root audit gate (the NEVR-586 knip-gate pattern applied
 * to authorization). Precedent: Plane v1.5.0-rc1 shipped a 30+-fix
 * object-level authorization sweep because nothing held the line per-route;
 * here the detector is blocking from day one instead.
 *
 * Part (a) pins the wiring: the `scope:audit` script, the tsconfig coverage,
 * and the blocking CI job. Part (b) pins the baseline: the audit exits 0 on
 * a clean tree (48 HttpApi endpoints + 32 MCP tools all carry a declared
 * scope root). Part (c) is the catch-behaviour negative control: a seeded
 * undeclared endpoint must redden R1 (exit 1) and a seeded stale table row
 * must redden R2 — plus in-process probes over the pure engine for R4–R13,
 * the registry-behaviour contract for BOUNDED_CURSORS/REDIRECT_SAFE
 * (NEVR-604 defect 2), and the credential rate-limit config pin (line f).
 */

const ROOT = join(import.meta.dir, "..", "..");
const RUNNER = join(ROOT, "tools", "scope-audit", "run.ts");
const GROUPS = join(ROOT, "packages", "kaneo", "src", "groups.ts");
const KANEO_SCOPE = join(ROOT, "packages", "kaneo", "src", "scope.ts");

function runAuditCli(): { status: number | null; output: string } {
	const result = spawnSync(process.execPath, [RUNNER], {
		cwd: ROOT,
		encoding: "utf8",
		timeout: 120_000,
	});
	return {
		status: result.status,
		output: `${result.stdout}\n${result.stderr}`,
	};
}

/** Seed a violation, expect the CLI to catch exactly it, always restore. */
function withMutation(
	file: string,
	mutate: (text: string) => string,
	run: () => void,
): void {
	const original = readFileSync(file, "utf8");
	let restored = false;
	try {
		writeFileSync(file, mutate(original));
		run();
	} finally {
		writeFileSync(file, original);
		restored = true;
	}
	expect(restored, "mutation must be restored").toBe(true);
}

// --- part (a): wiring -------------------------------------------------------------------------

test("NEVR-603 wiring: scope:audit script, tsconfig coverage, blocking CI job", () => {
	const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
		scripts?: Record<string, string>;
	};
	expect(pkg.scripts?.["scope:audit"]).toBe("bun tools/scope-audit/run.ts");

	const tsconfig = readFileSync(join(ROOT, "tsconfig.json"), "utf8");
	expect(
		tsconfig.includes('"tools/scope-audit/**/*.ts"'),
		"tsconfig include must cover the collector (typecheck gates it too)",
	).toBe(true);

	const ci = parse(
		readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8"),
	) as {
		jobs?: Record<string, Record<string, unknown>>;
	};
	const job = ci.jobs?.["scope-audit"];
	expect(job, "ci.yml must define the scope-audit job").toBeDefined();
	expect(job?.["continue-on-error"]).toBeUndefined();
	const steps = (job?.steps as Array<Record<string, unknown>>) ?? [];
	const runSteps = steps
		.filter((s) => typeof s.run === "string")
		.map((s) => s.run as string);
	expect(
		runSteps.some((run) => run.includes("bun run scope:audit")),
		"the job must run the audit script itself",
	).toBe(true);
	expect(
		steps.some((s) => s.uses?.toString().startsWith("actions/upload-artifact")),
		"the job must upload the audit log on failure",
	).toBe(true);
});

// --- part (b): clean-tree baseline -------------------------------------------------------------

test("NEVR-603 baseline: clean tree — every route carries a declared scope root", () => {
	const { status, output } = runAuditCli();
	if (status !== 0) console.error(output);
	expect(status, `scope-audit must exit 0 on a clean tree:\n${output}`).toBe(0);
	expect(output).toContain("HttpApi endpoints");
	expect(output).toContain("MCP tools");
});

// --- part (c): catch behaviour — end-to-end through the CLI ------------------------------------

test("NEVR-603 R1: a new undeclared endpoint fails the audit (the Plane failure mode)", () => {
	withMutation(
		GROUPS,
		(text) =>
			text.replace(
				'export class LabelsGroup extends HttpApiGroup.make("labels")\n',
				`export class LabelsGroup extends HttpApiGroup.make("labels")
	.add(
		HttpApiEndpoint.get("probe-scope", "/api/label/probe-x/:id", {
			params: Schema.Struct({ id: Id }),
			success: Json,
			error: DomainErrors,
		}),
	)
`,
			),
		() => {
			const { status, output } = runAuditCli();
			expect(status, "the undeclared endpoint must fail the build").toBe(1);
			expect(output).toContain("[R1]");
			expect(output).toContain("kaneo/labels/probe-scope");
		},
	);
	// The restore must itself be audit-clean (guards against a half-restore).
	const after = runAuditCli();
	expect(
		after.status,
		`audit must be clean after restore:\n${after.output}`,
	).toBe(0);
});

test("NEVR-603 R2: a stale table row cannot hide drift", () => {
	withMutation(
		KANEO_SCOPE,
		(text) =>
			text.replace(
				"\tlabels: {\n",
				'\tlabels: {\n\t\tprobeStaleRow: { scope: "public" },\n',
			),
		() => {
			const { status, output } = runAuditCli();
			expect(status, "a stale scope-root row must fail the build").toBe(1);
			expect(output).toContain("[R2]");
			expect(output).toContain("kaneo/labels/probeStaleRow");
		},
	);
});

// --- part (c): the pure engine, rule by rule ---------------------------------------------------

/** A minimal well-formed org route to mutate per probe. */
function probeRoute(overrides: Partial<AuditRoute> = {}): AuditRoute {
	return {
		id: "probe/route",
		kind: "http",
		method: "GET",
		path: "/api/probe/:org",
		declared: {
			scope: "org",
			parent: { resource: "org", from: "path", param: "org" },
		},
		request: { path: ["org"], query: [], payload: [] },
		successFields: [],
		errorJson: "",
		...overrides,
	};
}

describe("NEVR-603 engine rules", () => {
	test("R4: public routes carry no parent", () => {
		const findings = auditRoutes([
			probeRoute({
				path: "/api/probe",
				declared: {
					scope: "public",
					parent: { resource: "org", from: "path", param: "org" },
				},
			}),
		]);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.rule).toBe("R4");
	});

	test("R5: org/board/task without a parent resource is a finding", () => {
		for (const scope of ["org", "board", "task"] as const) {
			const findings = auditRoutes([
				probeRoute({
					declared: { scope },
					request: { path: ["org"], query: [], payload: [] },
				}),
			]);
			expect(
				findings.some((f) => f.rule === "R5"),
				scope,
			).toBe(true);
		}
	});

	test("R6: provenance must name a field that actually exists (path/query/payload)", () => {
		const findings = auditRoutes([
			probeRoute({
				declared: {
					scope: "org",
					parent: { resource: "org", from: "query", param: "organizationId" },
				},
				request: { path: ["org"], query: [], payload: [] },
			}),
		]);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.rule).toBe("R6");
		expect(findings[0]?.detail).toContain("query schema");
	});

	test("R6: a resolved parent must record the resolution path", () => {
		const findings = auditRoutes([
			probeRoute({
				declared: {
					scope: "task",
					parent: { resource: "task", from: "resolved" },
				},
				request: { path: [], query: [], payload: [] },
			}),
		]);
		expect(
			findings.some((f) => f.rule === "R6" && f.detail.includes("resolution")),
		).toBe(true);
	});

	test("R7: identity org-prefix law — /orgs/:org routes must be scope org", () => {
		const findings = auditRoutes([
			probeRoute({
				path: "/api/identity/orgs/:org/roles",
				declared: {
					scope: "user-self",
					parent: { resource: "org", from: "path", param: "org" },
				},
			}),
		]);
		expect(findings.some((f) => f.rule === "R7")).toBe(true);
	});

	test("R8: credential routes must be able to answer RateLimited", () => {
		const findings = auditRoutes([
			probeRoute({
				declared: {
					scope: "user-self",
					credential: true,
				},
			}),
		]);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.rule).toBe("R8");
	});

	test("R9: secret material only on returnsSecret routes; quotas are not secrets", () => {
		const leaked = auditRoutes([
			probeRoute({ successFields: ["name", "accessToken"] }),
		]);
		expect(leaked).toHaveLength(1);
		expect(leaked[0]?.rule).toBe("R9");
		expect(leaked[0]?.detail).toContain("accessToken");

		// aiDefaultTokenLimit is an AI quota, not a credential (triage correction:
		// naive token-substring matching produced a false positive here).
		expect(isSecretFieldName("aiDefaultTokenLimit")).toBe(false);
		expect(isSecretFieldName("accessToken")).toBe(true);

		const atCreate = auditRoutes([
			probeRoute({
				successFields: ["name", "secret"],
				declared: { scope: "user-self", returnsSecret: true },
			}),
		]);
		expect(atCreate).toHaveLength(0);
	});

	test("R10: cursor-ish request fields must be registered (or they fail CI)", () => {
		expect(isCursorFieldName("startingAfter")).toBe(true);
		expect(isCursorFieldName("dueBefore")).toBe(false); // a date filter
		const unregistered = auditRoutes([
			probeRoute({
				request: { path: ["org"], query: ["startingAfter"], payload: [] },
			}),
		]);
		expect(unregistered.some((f) => f.rule === "R10")).toBe(true);
		// Registration now carries the bound + the test that proves it —
		// a bare name no longer satisfies the audit (NEVR-604 defect 2).
		const registered = auditRoutes(
			[
				probeRoute({
					request: { path: ["org"], query: ["startingAfter"], payload: [] },
				}),
			],
			{
				boundedCursors: {
					startingAfter: {
						max: 100,
						test: "tests/bun/scope-audit-gate.test.ts",
					},
				},
			},
		);
		expect(registered).toHaveLength(0);
	});

	test("R11: redirect-ish request fields must be registered", () => {
		expect(isRedirectFieldName("callbackUrl")).toBe(true);
		const unregistered = auditRoutes([
			probeRoute({
				request: { path: ["org"], query: ["callbackUrl"], payload: [] },
			}),
		]);
		expect(unregistered.some((f) => f.rule === "R11")).toBe(true);
		const registered = auditRoutes(
			[
				probeRoute({
					request: { path: ["org"], query: ["callbackUrl"], payload: [] },
				}),
			],
			{
				redirectSafe: {
					callbackUrl: {
						rejectsAuthorityRelative: true,
						test: "tests/bun/scope-audit-gate.test.ts",
					},
				},
			},
		);
		expect(registered).toHaveLength(0);
	});

	test("R10/R11 registry contract: every entry carries its bound/proof and the proof file exists (NEVR-604 defect 2)", () => {
		for (const [name, entry] of Object.entries(BOUNDED_CURSORS)) {
			expect(
				Number.isInteger(entry.max),
				`${name}: max must be an integer`,
			).toBe(true);
			expect(entry.max, `${name}: max must be positive`).toBeGreaterThan(0);
			expect(existsSync(join(ROOT, entry.test)), `${name}: ${entry.test}`).toBe(
				true,
			);
		}
		for (const [name, entry] of Object.entries(REDIRECT_SAFE)) {
			expect(
				entry.rejectsAuthorityRelative,
				`${name}: must assert authority-relative rejection`,
			).toBe(true);
			expect(existsSync(join(ROOT, entry.test)), `${name}: ${entry.test}`).toBe(
				true,
			);
		}
		// The registries are empty today — the contract test exists so the
		// FIRST registration already has to carry behaviour with it.
	});

	test("R13: request schemas must not declare server-derived actor/timestamp fields (line b)", () => {
		expect(isServerDerivedFieldName("createdBy")).toBe(true);
		expect(isServerDerivedFieldName("created_at")).toBe(true);
		expect(isServerDerivedFieldName("updatedById")).toBe(true);
		// Naming a TARGET user is legitimate (add-team-member); the ACTOR
		// never is.
		expect(isServerDerivedFieldName("userId")).toBe(false);
		expect(isServerDerivedFieldName("assigneeId")).toBe(false);
		expect(isServerDerivedFieldName("expiresAt")).toBe(false);
		for (const where of ["path", "query", "payload"] as const) {
			const findings = auditRoutes([
				probeRoute({
					request: {
						path: ["org"],
						query: [],
						payload: [],
						[where]: ["createdBy"],
					},
				}),
			]);
			expect(
				findings.some((f) => f.rule === "R13"),
				`${where}`,
			).toBe(true);
		}
		// The shipped surface is clean: the real collector run is asserted by
		// the baseline test above; this proves the rule fires at all.
	});

	test("R2 (in process): stale rows name routes that do not exist", () => {
		const findings = staleRows([probeRoute()], ["probe/route", "probe/ghost"]);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.rule).toBe("R2");
		expect(findings[0]?.route).toBe("probe/ghost");
	});
});

// --- line (f): credential rate limiting stays on everywhere ------------------------------------

test("NEVR-603 line (f): better-auth rate limiting is not cloud-gated", async () => {
	process.env.DATABASE_URL ??= "postgres://probe:probe@127.0.0.1:1/probe";
	process.env.AUTH_SECRET ??= "probe-secret-probe-secret-probe-secret";
	// Hermetic URL env (NEVR-605 defect 1, the kaneo-parity pattern): in a
	// clean CI environment better-auth's async init otherwise rejects with
	// "Invalid base URL: undefined" AFTER the test passes — an unhandled
	// error between tests that fails the whole run. BETTER_AUTH_URL is
	// better-auth's own fallback when a context is built without an explicit
	// baseURL; KANEO_API_URL feeds auth.ts's baseURL derivation.
	process.env.BETTER_AUTH_URL ??= "http://localhost";
	process.env.KANEO_API_URL ??= "http://localhost";
	process.env.KANEO_CLIENT_URL ??= "http://localhost:5173";
	// Template-literal specifier (the kaneo-parity pattern): the strict root
	// typecheck must not crawl the legacy tree — it keeps its own compiler
	// settings.
	const L = "../../packages/kaneo-legacy/src";
	const { auth } = (await import(`${L}/auth.ts`)) as {
		auth: {
			options: {
				rateLimit: {
					enabled?: boolean;
					window?: number;
					max?: number;
					customRules?: Record<string, { window?: number; max?: number }>;
				};
			};
		};
	};
	expect(
		auth.options.rateLimit.enabled,
		"credential surfaces are rate-limited on every deployment (Plane #9335)",
	).toBe(true);
	expect(auth.options.rateLimit.customRules?.["/sign-up/email"]).toEqual({
		window: 60,
		max: 3,
	});
	expect(
		auth.options.rateLimit.customRules?.["/organization/invite-member"],
	).toEqual({
		window: 60,
		max: 5,
	});
});
