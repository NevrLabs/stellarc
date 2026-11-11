import { createHash, randomBytes } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";

export class Denied extends Error {
	constructor(
		readonly status: number,
		readonly reason: string,
	) {
		super(reason);
	}
}
const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");
export const gatewaySchema = `
CREATE TABLE IF NOT EXISTS gw_installation(id uuid PRIMARY KEY);
INSERT INTO gw_installation SELECT gen_random_uuid() WHERE NOT EXISTS(SELECT 1 FROM gw_installation);
CREATE TABLE IF NOT EXISTS gw_principal(id text PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('human','agent')),org text NOT NULL,subject text UNIQUE,enabled boolean NOT NULL DEFAULT true,permissions jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS gw_credential(id uuid PRIMARY KEY,principal text NOT NULL REFERENCES gw_principal(id),digest text UNIQUE NOT NULL,expires_at timestamptz NOT NULL,revoked boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS gw_delegation(id uuid PRIMARY KEY,parent uuid REFERENCES gw_delegation(id),org text NOT NULL,actor text NOT NULL REFERENCES gw_principal(id),subject text NOT NULL REFERENCES gw_principal(id),audience text NOT NULL,resource text NOT NULL,actions jsonb NOT NULL,expires_at timestamptz NOT NULL,remaining integer NOT NULL CHECK(remaining>=0),revoked boolean NOT NULL DEFAULT false,depth integer NOT NULL CHECK(depth BETWEEN 1 AND 4));
CREATE TABLE IF NOT EXISTS gw_run(id uuid PRIMARY KEY,org text NOT NULL,actor text NOT NULL REFERENCES gw_principal(id),subject text NOT NULL,delegation uuid REFERENCES gw_delegation(id),request text NOT NULL,trace text NOT NULL,action text NOT NULL,outcome text NOT NULL DEFAULT 'running' CHECK(outcome IN ('running','completed','cancelled','failed','interrupted')),terminal_choice text CHECK(terminal_choice IN ('completed','cancelled','failed','interrupted')),recover_after timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '2 minutes'),started_at timestamptz NOT NULL DEFAULT clock_timestamp(),ended_at timestamptz);
ALTER TABLE gw_run ADD COLUMN IF NOT EXISTS terminal_choice text CHECK(terminal_choice IN ('completed','cancelled','failed','interrupted'));
ALTER TABLE gw_run ADD COLUMN IF NOT EXISTS recover_after timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '2 minutes');
ALTER TABLE gw_run DROP CONSTRAINT IF EXISTS gw_run_outcome_check;
ALTER TABLE gw_run ADD CONSTRAINT gw_run_outcome_check CHECK(outcome IN ('running','completed','cancelled','failed','interrupted'));
CREATE INDEX IF NOT EXISTS gw_run_recovery ON gw_run(recover_after) WHERE outcome='running';
CREATE TABLE IF NOT EXISTS gw_audit_state(org text PRIMARY KEY,seq bigint NOT NULL DEFAULT 0,delivered bigint NOT NULL DEFAULT 0,gap boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS gw_audit(org text NOT NULL,seq bigint NOT NULL,id text UNIQUE NOT NULL,at timestamptz NOT NULL DEFAULT clock_timestamp(),kind text NOT NULL,actor text NOT NULL,subject text NOT NULL,request text NOT NULL,trace text NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(org,seq));
`;
export type Principal = {
	id: string;
	kind: "human" | "agent";
	org: string;
	permissions: string[];
};
type Delegation = {
	id: string;
	parent: string | null;
	org: string;
	actor: string;
	subject: string;
	audience: string;
	resource: string;
	actions: string[];
	expires_at: Date;
	remaining: number;
	revoked: boolean;
	depth: number;
	fresh: boolean;
};
export function gatewayStore(sql: Sql) {
	const lock = (tx: TransactionSql) =>
		tx`SELECT pg_advisory_xact_lock(719324821)`;
	// ponytail: one short global authorization lock; shard by org after measured contention.
	// Every grant/policy/credential mutation and admission uses this lock. Never hold it over I/O.
	async function audit(
		tx: TransactionSql,
		org: string,
		kind: string,
		actor: string,
		subject: string,
		request: string,
		trace: string,
		extra: Record<string, string> = {},
		emergency = false,
	) {
		await tx`INSERT INTO gw_audit_state(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
		const [s] =
			await tx`SELECT seq::text,delivered::text FROM gw_audit_state WHERE org=${org} FOR UPDATE`;
		if (BigInt(s.seq) - BigInt(s.delivered) >= BigInt(emergency ? 1100 : 1000))
			throw new Denied(503, "audit_capacity");
		const [{ seq }] =
			await tx`UPDATE gw_audit_state SET seq=seq+1 WHERE org=${org} RETURNING seq::text`;
		const [{ id: installation }] = await tx`SELECT id FROM gw_installation`;
		const id = `${installation}:${org}:${seq}`;
		await tx`INSERT INTO gw_audit(org,seq,id,kind,actor,subject,request,trace,payload) VALUES (${org},${seq},${id},${kind},${actor},${subject},${request},${trace},${tx.json(extra)})`;
	}
	async function transaction<A>(
		fn: (tx: TransactionSql) => Promise<A>,
	): Promise<A> {
		try {
			return (await sql.begin(async (tx) => {
				await lock(tx);
				return fn(tx);
			})) as A;
		} catch (error) {
			if (error instanceof Denied && error.reason === "audit_capacity") {
				// Separate bounded state update persists the gap after the failed mutation rolled back.
				await sql`INSERT INTO gw_audit_state(org,gap) VALUES ('system',true) ON CONFLICT(org) DO UPDATE SET gap=true`;
			}
			throw error;
		}
	}
	async function principal(tx: TransactionSql, id: string) {
		const [p] =
			await tx`SELECT id,kind,org,permissions FROM gw_principal WHERE id=${id} AND enabled=true`;
		if (!p) throw new Denied(403, "principal_inactive");
		return p as Principal;
	}
	async function bootstrap(id: string, subject: string, org: string) {
		if (!/^[a-z0-9-]{1,64}$/.test(org)) throw new Error("Invalid org");
		await transaction(async (tx) => {
			const existing =
				await tx`SELECT id FROM gw_principal WHERE subject=${subject}`;
			if (existing.length) return;
			await audit(
				tx,
				org,
				"principal.bootstrap",
				id,
				id,
				crypto.randomUUID(),
				"",
			);
			await tx`INSERT INTO gw_principal(id,kind,org,subject,permissions) VALUES (${id},'human',${org},${subject},${tx.json(["manage", "llm:stream", "mcp:status"])})`;
		});
	}
	async function human(subject: string) {
		const [p] =
			await sql`SELECT id,org FROM gw_principal WHERE subject=${subject} AND kind='human' AND enabled=true`;
		return p
			? {
					id: p.id as string,
					name: "Stellarc operator",
					email: `${p.id}@identity.invalid`,
				}
			: null;
	}
	async function fromHuman(id: string) {
		return transaction(async (tx) => {
			const p = await principal(tx, id);
			if (p.kind !== "human") throw new Denied(403, "human_required");
			return p;
		});
	}
	async function manage(tx: TransactionSql, id: string) {
		const p = await principal(tx, id);
		if (p.kind !== "human" || !p.permissions.includes("manage"))
			throw new Denied(403, "manage_required");
		return p;
	}
	async function createAgent(operator: string, actions: string[]) {
		if (
			!actions.length ||
			actions.some((a) => !["llm:stream", "mcp:status"].includes(a))
		)
			throw new Denied(400, "invalid_actions");
		return transaction(async (tx) => {
			const p = await manage(tx, operator);
			const id = crypto.randomUUID();
			await audit(tx, p.org, "agent.create", operator, id, id, "");
			await tx`INSERT INTO gw_principal(id,kind,org,permissions) VALUES (${id},'agent',${p.org},${tx.json([...new Set(actions)])})`;
			return id;
		});
	}
	async function issue(operator: string, target: string, ttl = 3600) {
		if (!Number.isInteger(ttl) || ttl < 1 || ttl > 86400)
			throw new Denied(400, "invalid_ttl");
		return transaction(async (tx) => {
			const p = await manage(tx, operator);
			const a = await principal(tx, target);
			if (p.org !== a.org || a.kind !== "agent")
				throw new Denied(403, "agent_required");
			const id = crypto.randomUUID();
			const raw = randomBytes(32).toString("base64url");
			await audit(tx, p.org, "credential.issue", p.id, a.id, id, "");
			await tx`INSERT INTO gw_credential(id,principal,digest,expires_at) VALUES (${id},${a.id},${hash(raw)},clock_timestamp()+${ttl}*interval '1 second')`;
			return { id, raw };
		});
	}
	async function revoke(operator: string, id: string, delegation = false) {
		return transaction(async (tx) => {
			const p = await manage(tx, operator);
			const rows = delegation
				? await tx`SELECT org FROM gw_delegation WHERE id=${id}`
				: await tx`SELECT p.org FROM gw_credential c JOIN gw_principal p ON p.id=c.principal WHERE c.id=${id}`;
			if (rows[0]?.org !== p.org) throw new Denied(404, "not_found");
			await audit(
				tx,
				p.org,
				delegation ? "delegation.revoke" : "credential.revoke",
				p.id,
				p.id,
				id,
				"",
				{},
				true,
			);
			if (delegation)
				await tx`UPDATE gw_delegation SET revoked=true WHERE id=${id}`;
			else await tx`UPDATE gw_credential SET revoked=true WHERE id=${id}`;
		});
	}
	async function credential(tx: TransactionSql, raw: string) {
		if (!/^[A-Za-z0-9_-]{43}$/.test(raw))
			throw new Denied(401, "invalid_credential");
		const [c] =
			await tx`SELECT principal FROM gw_credential WHERE digest=${hash(raw)} AND NOT revoked AND expires_at>clock_timestamp()`;
		if (!c) throw new Denied(401, "invalid_credential");
		return principal(tx, c.principal);
	}
	async function chain(tx: TransactionSql, id: string) {
		const result: Delegation[] = [];
		let next: string | null = id;
		while (next) {
			if (result.length >= 4 || result.some((d) => d.id === next))
				throw new Denied(403, "delegation_chain");
			const [d]: Delegation[] = await tx<
				Delegation[]
			>`SELECT *,expires_at>clock_timestamp() AS fresh FROM gw_delegation WHERE id=${next}`;
			if (!d || d.revoked || !d.fresh)
				throw new Denied(403, "delegation_inactive");
			result.push(d);
			next = d.parent;
		}
		return result;
	}
	async function delegate(
		operator: string,
		target: string,
		options: {
			actions: string[];
			resource: string;
			ttl: number;
			calls: number;
			parent?: string;
		},
		raw?: string,
	) {
		if (
			!options.actions.length ||
			options.actions.some((a) => !["llm:stream", "mcp:status"].includes(a)) ||
			options.resource !== "gateway" ||
			!Number.isInteger(options.ttl) ||
			options.ttl < 1 ||
			options.ttl > 3600 ||
			!Number.isInteger(options.calls) ||
			options.calls < 1 ||
			options.calls > 1000
		)
			throw new Denied(400, "invalid_delegation");
		return transaction(async (tx) => {
			const p = raw ? await credential(tx, raw) : await manage(tx, operator);
			const a = await principal(tx, target);
			if (p.org !== a.org || a.kind !== "agent")
				throw new Denied(403, "cross_org");
			let subject = p.id;
			let depth = 1;
			if (options.parent) {
				const ancestors = await chain(tx, options.parent);
				const parent = ancestors[0];
				if (
					parent.actor !== p.id ||
					parent.org !== p.org ||
					parent.audience !== "stellarc-gateway" ||
					parent.resource !== options.resource ||
					parent.depth >= 4 ||
					parent.remaining < options.calls ||
					new Date(parent.expires_at).getTime() <
						Date.now() + options.ttl * 1000 ||
					options.actions.some((x) => !parent.actions.includes(x))
				)
					throw new Denied(403, "delegation_widening");
				subject = parent.subject;
				depth = parent.depth + 1;
			} else if (p.kind !== "human")
				throw new Denied(403, "explicit_parent_required");
			const owner = await principal(tx, subject);
			if (
				options.actions.some(
					(x) =>
						!p.permissions.includes(x) ||
						!a.permissions.includes(x) ||
						!owner.permissions.includes(x),
				)
			)
				throw new Denied(403, "scope_widening");
			const id = crypto.randomUUID();
			await audit(tx, p.org, "delegation.issue", p.id, subject, id, "", {
				delegate: a.id,
				parent: options.parent ?? "",
			});
			await tx`INSERT INTO gw_delegation(id,parent,org,actor,subject,audience,resource,actions,expires_at,remaining,depth) VALUES (${id},${options.parent ?? null},${p.org},${a.id},${subject},'stellarc-gateway',${options.resource},${tx.json(options.actions)},clock_timestamp()+${options.ttl}*interval '1 second',${options.calls},${depth})`;
			return id;
		});
	}
	// Caller must use this store's advisory-locked transaction. No nested begin,
	// readmission or budget decrement occurs in this shared authority evaluation.
	async function authorityInTransaction(
		tx: TransactionSql,
		raw: string,
		org: string | undefined,
		action: string,
		request: string,
		trace: string,
		delegation: string | undefined,
		admit: boolean,
	): Promise<
		| { error: Denied }
		| { principal: Principal; subject: string; ancestors: Delegation[] }
	> {
		let p: Principal;
		try {
			p = await credential(tx, raw);
		} catch (error) {
			await audit(
				tx,
				"system",
				"call.deny",
				"anonymous",
				"anonymous",
				request,
				trace,
				{},
				true,
			);
			return { error: error as Denied };
		}
		const targetOrg = org ?? p.org;
		let subject = p.id;
		let ancestors: Awaited<ReturnType<typeof chain>> = [];
		try {
			if (p.org !== targetOrg || !p.permissions.includes(action))
				throw new Denied(403, "scope_denied");
			if (delegation) {
				ancestors = await chain(tx, delegation);
				const leaf = ancestors[0];
				subject = leaf.subject;
				if (leaf.actor !== p.id) throw new Denied(403, "actor_mismatch");
				const owner = await principal(tx, subject);
				if (owner.org !== targetOrg || !owner.permissions.includes(action))
					throw new Denied(403, "subject_denied");
				for (let i = 0; i < ancestors.length; i++) {
					const d = ancestors[i];
					const actor = await principal(tx, d.actor);
					if (
						d.org !== targetOrg ||
						d.subject !== subject ||
						d.audience !== "stellarc-gateway" ||
						d.resource !== "gateway" ||
						!d.actions.includes(action) ||
						actor.org !== targetOrg ||
						!actor.permissions.includes(action) ||
						(admit && d.remaining < 1)
					)
						throw new Denied(403, "delegation_denied");
				}
			}
		} catch (error) {
			await audit(
				tx,
				p.org,
				"call.deny",
				p.id,
				subject,
				request,
				trace,
				{},
				true,
			);
			return { error: error as Denied };
		}
		return { principal: p, subject, ancestors };
	}
	async function recheckRun(
		tx: TransactionSql,
		raw: string,
		expected: {
			runId: string;
			org: string;
			actor: string;
			subject: string;
			delegation?: string;
			action: string;
			request: string;
		},
	) {
		// This is an existing-admission check, not permission to start new work.
		const authority = await authorityInTransaction(
			tx,
			raw,
			expected.org,
			expected.action,
			expected.request,
			"",
			expected.delegation,
			false,
		);
		if ("error" in authority) throw authority.error;
		const [run] =
			await tx`SELECT *,recover_after>clock_timestamp() AS fresh FROM gw_run WHERE id=${expected.runId} FOR UPDATE`;
		if (
			!run ||
			run.org !== expected.org ||
			run.actor !== expected.actor ||
			run.subject !== expected.subject ||
			run.delegation !== (expected.delegation ?? null) ||
			run.action !== expected.action ||
			run.request !== expected.request ||
			authority.principal.id !== expected.actor ||
			authority.subject !== expected.subject
		)
			throw new Denied(403, "run_context");
		if (
			run.outcome !== "running" ||
			run.terminal_choice !== null ||
			run.fresh !== true
		)
			throw new Denied(409, "run_not_dispatchable");
		return {
			principal: authority.principal,
			subject: authority.subject,
			runId: expected.runId,
		};
	}
	async function authorize(
		raw: string,
		org: string | undefined,
		action: string,
		request: string,
		trace: string,
		delegation?: string,
		admit = true,
	) {
		return transaction(async (tx) => {
			const authority = await authorityInTransaction(
				tx,
				raw,
				org,
				action,
				request,
				trace,
				delegation,
				admit,
			);
			if ("error" in authority) return authority;
			const { principal: p, subject, ancestors } = authority;
			const targetOrg = org ?? p.org;
			const runId = admit ? crypto.randomUUID() : undefined;
			if (admit) {
				const [backlog] =
					await tx`SELECT count(*)::int AS running,coalesce(bool_or(org=${targetOrg} AND (terminal_choice IS NOT NULL OR recover_after<=clock_timestamp())),false) AS pending FROM gw_run WHERE outcome='running'`;
				if (backlog.pending) throw new Denied(503, "terminal_backlog");
				// ponytail: global 64-run ceiling; per-org quotas after measured contention.
				if (backlog.running >= 64) throw new Denied(503, "run_capacity");
				await audit(
					tx,
					targetOrg,
					"call.admit",
					p.id,
					subject,
					request,
					trace,
					{ action, delegation: delegation ?? "", run: runId! },
				);
				await tx`INSERT INTO gw_run(id,org,actor,subject,delegation,request,trace,action) VALUES (${runId!},${targetOrg},${p.id},${subject},${delegation ?? null},${request},${trace},${action})`;
				for (const d of ancestors)
					await tx`UPDATE gw_delegation SET remaining=remaining-1 WHERE id=${d.id}`;
			}
			return { principal: p, subject, delegation, runId };
		}).then((r) => {
			if ("error" in r) throw r.error;
			return r;
		});
	}
	async function finish(
		id: string,
		outcome: "completed" | "cancelled" | "failed" | "interrupted",
	) {
		// Persist the decision independently of the audit append. No success is
		// published until the second transaction commits; recovery retains intent.
		await transaction(async (tx) => {
			const [run] =
				await tx`SELECT outcome,terminal_choice FROM gw_run WHERE id=${id} FOR UPDATE`;
			if (!run) throw new Denied(404, "run_not_found");
			if (
				(run.terminal_choice && run.terminal_choice !== outcome) ||
				(run.outcome !== "running" && run.outcome !== outcome)
			)
				throw new Denied(409, "run_already_finished");
			await tx`UPDATE gw_run SET terminal_choice=${outcome} WHERE id=${id} AND terminal_choice IS NULL`;
		});
		return transaction(async (tx) => {
			const [run] = await tx`SELECT * FROM gw_run WHERE id=${id} FOR UPDATE`;
			if (!run) throw new Denied(404, "run_not_found");
			if (run.outcome !== "running") {
				if (run.outcome !== outcome)
					throw new Denied(409, "run_already_finished");
				return;
			}
			await audit(
				tx,
				run.org,
				`call.${outcome}`,
				run.actor,
				run.subject,
				run.request,
				run.trace,
				{
					run: id,
					action: run.action,
					delegation: run.delegation ?? "",
					usage: "unavailable",
					...(outcome === "interrupted" ? { externalEffect: "unknown" } : {}),
				},
				true,
			);
			await tx`UPDATE gw_run SET outcome=${outcome},ended_at=clock_timestamp() WHERE id=${id}`;
		});
	}
	async function recover() {
		// ponytail: fixed two-minute orphan grace covers the 30s request ceiling;
		// no effect replay. Use fenced leases before adding long-running tools.
		const pending =
			await sql`SELECT id,terminal_choice FROM gw_run WHERE outcome='running' AND (terminal_choice IS NOT NULL OR recover_after<=clock_timestamp()) ORDER BY recover_after,id LIMIT 16`;
		let failure: unknown;
		for (const run of pending) {
			try {
				await finish(run.id, run.terminal_choice ?? "interrupted");
			} catch (error) {
				if (!(error instanceof Denied && error.status === 409)) {
					failure = error;
					// Move failed rows behind untouched work; preserve terminal choice.
					await transaction(async (tx) => {
						await tx`UPDATE gw_run SET recover_after=clock_timestamp() WHERE id=${run.id} AND outcome='running'`;
					});
				}
			}
		}
		if (failure) throw failure;
	}
	async function securityEvent(
		kind: string,
		actor = "anonymous",
		request = crypto.randomUUID(),
		trace = "",
	) {
		return transaction(async (tx) => {
			const [p] =
				actor === "anonymous"
					? []
					: await tx`SELECT id,org FROM gw_principal WHERE id=${actor} AND enabled=true`;
			await audit(
				tx,
				p?.org ?? "system",
				kind,
				p?.id ?? "anonymous",
				p?.id ?? "anonymous",
				request,
				trace,
				{},
				true,
			);
		});
	}
	return {
		bootstrap,
		human,
		fromHuman,
		createAgent,
		issue,
		revoke,
		delegate,
		authorize,
		recheckRun,
		finish,
		recover,
		securityEvent,
		transaction,
		audit,
		sql,
	};
}
