import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";
import type { TransactionSql } from "postgres";
import type { gatewayStore } from "../../../packages/core-auth/src/store";
import { Denied } from "../../../packages/core-auth/src/store";

/**
 * Durable human tool-approval queue with a single-claim release primitive.
 *
 * Lifecycle: pending -> approved | declined | cancelled | expired
 *            approved -> dispatching (exactly one winner) -> succeeded | failed | outcome_unknown
 *
 * Contract:
 * - Runtime never creates or migrates; `toolApprovalSchema` is applied by the
 *   owner only. INSERT/UPDATE on gw_tool_approval is granted to the runtime
 *   role, schema DDL is not.
 * - `enqueue` context values MUST come from a store.authorize()-verified
 *   admission (org/actor/subject/delegation/runId), never client headers.
 * - Full frozen args live only inside an AES-256-GCM envelope bound (AAD) to
 *   the digest of the verified context + frozen identity. `projection` is the
 *   redacted human view and must never contain args or secrets.
 * - `decide` authority is a verified enabled human principal in the row's org;
 *   there is no caller-supplied boolean.
 * - `claim` releases the payload to exactly one winner across processes
 *   (advisory-locked transaction + conditional state UPDATE). Losers/replays
 *   never decrypt. The recheck callback runs INSIDE the claim transaction
 *   under the global advisory lock: no network I/O, prompt return, false
 *   fails closed (row stays approved).
 * - After a claim, nothing here retries or re-releases; `recover` only
 *   classifies a lease-expired dispatch as outcome_unknown — external effect
 *   stays unknown, never success. Business effects are performed by the
 *   executor integration, not this module.
 * - Every mutation audits in the same transaction; audit denial fails closed
 *   with a fixed safe reason. No args or secrets appear in audits/projections.
 */

export type GatewayStore = ReturnType<typeof gatewayStore>;

export const toolApprovalSchema = `
CREATE TABLE IF NOT EXISTS gw_tool_approval(
	id uuid PRIMARY KEY,
	org text NOT NULL,
	actor text NOT NULL,
	subject text NOT NULL,
	delegation text,
	run_id text NOT NULL,
	operation text NOT NULL,
	binding text NOT NULL,
	request_digest text NOT NULL,
	context_digest text NOT NULL,
	projection jsonb NOT NULL,
	envelope text NOT NULL,
	state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','declined','cancelled','dispatching','succeeded','failed','outcome_unknown','expired')),
	expires_at timestamptz NOT NULL,
	decided_by text,
	decided_at timestamptz,
	claimed_by text,
	claimed_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
	updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS gw_tool_approval_queue ON gw_tool_approval(org,created_at) WHERE state IN ('pending','approved');
`;

export type ToolApprovalState =
	| "pending"
	| "approved"
	| "declined"
	| "cancelled"
	| "dispatching"
	| "succeeded"
	| "failed"
	| "outcome_unknown"
	| "expired";

export type ApprovalContext = Readonly<{
	org: string;
	actor: string;
	subject: string;
	delegation?: string;
	runId: string;
	request: string;
	trace: string;
}>;

export type FrozenIdentity = Readonly<{
	operation: string;
	binding: string;
	requestDigest: string;
	revision?: string;
	method?: string;
	effectClass?: string;
}>;

export type ToolApprovalBounds = {
	maxPayloadBytes: number;
	maxProjectionBytes: number;
	maxPendingPerOrg: number;
	claimLeaseSeconds: number;
};

export type EnqueueInput = {
	context: ApprovalContext;
	identity: FrozenIdentity;
	projection: Record<string, unknown>;
	frozenArgs: unknown;
	ttlSeconds: number;
};

export type ClaimedPayload = {
	context: ApprovalContext;
	identity: FrozenIdentity;
	args: unknown;
};

export type ClaimRecheck = (
	tx: TransactionSql,
	record: {
		org: string;
		actor: string;
		subject: string;
		delegation: string | null;
		runId: string;
		operation: string;
		binding: string;
		requestDigest: string;
	},
) => Promise<boolean>;

// F1: result of a transaction that must COMMIT its audit/transition and only
// then deny — the same {error} sentinel pattern as store.authorize, so the
// refusal itself never rolls back the evidence it carries.
type Committed<T> = { refused: Denied } | { value: T };

const hex64 = /^[a-f0-9]{64}$/;
const ident128 = /^[A-Za-z0-9_.:-]{1,128}$/;
const orgName = /^[a-z0-9-]{1,64}$/;
const positiveInt = (n: unknown) => Number.isInteger(n) && (n as number) > 0;

export function createToolApprovals(
	store: GatewayStore,
	key: Uint8Array,
	bounds: ToolApprovalBounds,
) {
	if (!(key instanceof Uint8Array) || key.byteLength !== 32)
		throw new Error("Approval key must be exactly 32 owner-handle bytes");
	if (
		!positiveInt(bounds.maxPayloadBytes) ||
		bounds.maxPayloadBytes > 1_048_576 ||
		!positiveInt(bounds.maxProjectionBytes) ||
		bounds.maxProjectionBytes > 65_536 ||
		!positiveInt(bounds.maxPendingPerOrg) ||
		bounds.maxPendingPerOrg > 1_000 ||
		!positiveInt(bounds.claimLeaseSeconds) ||
		bounds.claimLeaseSeconds > 3_600
	)
		throw new Error("Invalid tool approval bounds");
	// ponytail: claim lease is global per-instance; the integration must size it
	// above the executor dispatch deadline so a live dispatch is never classified.
	const hashHex = (text: string) =>
		createHash("sha256").update(text).digest("hex");
	const contextDigest = (row: {
		id?: string;
		org: string;
		actor: string;
		subject: string;
		delegation?: string | null;
		runId?: string;
		run_id?: string;
		operation: string;
		binding: string;
		requestDigest?: string;
		request_digest?: string;
	}) =>
		hashHex(
			JSON.stringify([
				row.id,
				row.org,
				row.actor,
				row.subject,
				row.delegation ?? "",
				row.run_id ?? row.runId,
				row.operation,
				row.binding,
				row.requestDigest ?? row.request_digest,
			]),
		);

	function seal(aad: string, plaintext: string): string {
		const iv = randomBytes(12);
		const cipher = createCipheriv("aes-256-gcm", key, iv);
		cipher.setAAD(Buffer.from(aad, "utf8"));
		const ct = Buffer.concat([
			cipher.update(plaintext, "utf8"),
			cipher.final(),
		]);
		return JSON.stringify({
			v: 1,
			alg: "aes-256-gcm",
			iv: iv.toString("base64"),
			tag: cipher.getAuthTag().toString("base64"),
			ct: ct.toString("base64"),
		});
	}
	function open(aad: string, envelope: string): string {
		let parsed: {
			v?: number;
			alg?: string;
			iv?: string;
			tag?: string;
			ct?: string;
		};
		try {
			parsed = JSON.parse(envelope);
		} catch {
			throw new Denied(500, "integrity_failure");
		}
		if (
			parsed?.v !== 1 ||
			parsed.alg !== "aes-256-gcm" ||
			!parsed.iv ||
			!parsed.tag ||
			!parsed.ct
		)
			throw new Denied(500, "integrity_failure");
		try {
			const decipher = createDecipheriv(
				"aes-256-gcm",
				key,
				Buffer.from(parsed.iv, "base64"),
			);
			decipher.setAAD(Buffer.from(aad, "utf8"));
			decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
			return Buffer.concat([
				decipher.update(Buffer.from(parsed.ct, "base64")),
				decipher.final(),
			]).toString("utf8");
		} catch {
			throw new Denied(500, "integrity_failure");
		}
	}
	async function audited(
		tx: TransactionSql,
		org: string,
		kind: string,
		actor: string,
		subject: string,
		request: string,
		trace: string,
		extra: Record<string, string>,
	) {
		try {
			await store.audit(tx, org, kind, actor, subject, request, trace, extra);
		} catch (error) {
			if (error instanceof Denied) throw error;
			throw new Denied(503, "audit_denied");
		}
	}
	const markExpired = async (
		tx: TransactionSql,
		id: string,
		org: string,
		actor: string,
		subject: string,
		runId: string,
	) => {
		await audited(tx, org, "tool.approval.expired", actor, subject, runId, "", {
			approval: id,
		});
		await tx`UPDATE gw_tool_approval SET state='expired', updated_at=clock_timestamp() WHERE id=${id} AND state IN ('pending','approved')`;
	};

	async function enqueue(input: EnqueueInput) {
		const c = input.context;
		const i = input.identity;
		if (
			!c ||
			!orgName.test(String(c.org)) ||
			!ident128.test(String(c.actor)) ||
			!ident128.test(String(c.subject)) ||
			(c.delegation !== undefined && !ident128.test(String(c.delegation))) ||
			!ident128.test(String(c.runId)) ||
			!i ||
			!ident128.test(String(i.operation)) ||
			!hex64.test(String(i.binding)) ||
			!hex64.test(String(i.requestDigest))
		)
			throw new Denied(400, "invalid_context");
		if (
			!Number.isInteger(input.ttlSeconds) ||
			input.ttlSeconds < 1 ||
			input.ttlSeconds > 86_400
		)
			throw new Denied(400, "invalid_ttl");
		const argsText = JSON.stringify(input.frozenArgs);
		if (typeof argsText !== "string" || argsText.length === 0)
			throw new Denied(400, "invalid_context");
		if (Buffer.byteLength(argsText) > bounds.maxPayloadBytes)
			throw new Denied(400, "request_too_large");
		const projectionText = JSON.stringify(input.projection);
		if (
			typeof projectionText !== "string" ||
			projectionText.length === 0 ||
			Buffer.byteLength(projectionText) > bounds.maxProjectionBytes
		)
			throw new Denied(400, "projection_too_large");
		// JSON-typed value for the jsonb parameter comes from the serialization the
		// boundary above just validated — parse it back so the stored bytes are
		// exactly the checked projectionText, with no unvalidated payload shapes.
		const projectionJson: Parameters<TransactionSql["json"]>[0] =
			JSON.parse(projectionText);
		const id = crypto.randomUUID();
		const digest = contextDigest({
			id,
			org: c.org,
			actor: c.actor,
			subject: c.subject,
			delegation: c.delegation,
			runId: c.runId,
			operation: i.operation,
			binding: i.binding,
			requestDigest: i.requestDigest,
		});
		const envelope = seal(
			digest,
			JSON.stringify({ identity: i, args: input.frozenArgs }),
		);
		return store.transaction(async (tx) => {
			const [{ n }] =
				await tx`SELECT count(*)::int AS n FROM gw_tool_approval WHERE org=${c.org} AND state IN ('pending','approved')`;
			if (n >= bounds.maxPendingPerOrg)
				throw new Denied(503, "approval_capacity");
			await audited(
				tx,
				c.org,
				"tool.approval.enqueue",
				c.actor,
				c.subject,
				c.request,
				c.trace,
				{ approval: id, run: c.runId, operation: i.operation },
			);
			const [created] = await tx`
				INSERT INTO gw_tool_approval(id,org,actor,subject,delegation,run_id,operation,binding,request_digest,context_digest,projection,envelope,expires_at)
				VALUES (${id},${c.org},${c.actor},${c.subject},${c.delegation ?? null},${c.runId},${i.operation},${i.binding},${i.requestDigest},${digest},${tx.json(projectionJson)},${envelope},clock_timestamp()+(${input.ttlSeconds}*interval '1 second'))
				RETURNING expires_at`;
			return { id, expiresAt: new Date(created.expires_at) };
		});
	}

	async function decide(
		id: string,
		org: string,
		human: string,
		action: "accept" | "decline" | "cancel",
	) {
		if (!["accept", "decline", "cancel"].includes(action))
			throw new Denied(400, "invalid_action");
		if (!ident128.test(String(id)) || !orgName.test(String(org)))
			throw new Denied(400, "invalid_context");
		const outcome = await store.transaction(
			async (tx): Promise<Committed<void>> => {
				const [row] =
					await tx`SELECT *, (expires_at>clock_timestamp()) AS live FROM gw_tool_approval WHERE id=${id} FOR UPDATE`;
				if (!row || row.org !== org) throw new Denied(404, "not_found");
				const [decider] =
					await tx`SELECT kind FROM gw_principal WHERE id=${human} AND org=${org} AND enabled=true`;
				if (decider?.kind !== "human") throw new Denied(403, "human_required");
				// N1: expiry authority is the DB clock, not the app clock.
				if (row.state === "expired" || row.live !== true) {
					if (row.state === "pending" || row.state === "approved")
						await markExpired(tx, id, org, row.actor, row.subject, row.run_id);
					// F1: commit the expired transition + audit, then deny.
					return { refused: new Denied(410, "expired") };
				}
				if (row.state !== "pending") throw new Denied(409, "already_decided");
				const next =
					action === "accept"
						? "approved"
						: action === "decline"
							? "declined"
							: "cancelled";
				await audited(
					tx,
					org,
					"tool.approval.decision_attempt",
					row.actor,
					row.subject,
					row.run_id,
					"",
					{ approval: id, human, action },
				);
				// N1: guard the acceptance with the DB-time predicate — an
				// audit wait that crosses the deadline must never release
				// authority. The attempted-action audit above stands as the
				// record of the attempt; the miss below persists the F1
				// expired transition instead.
				const [accepted] =
					await tx`UPDATE gw_tool_approval SET state=${next}, decided_by=${human}, decided_at=clock_timestamp(), updated_at=clock_timestamp() WHERE id=${id} AND state='pending' AND expires_at>clock_timestamp() RETURNING id`;
				if (!accepted) {
					await markExpired(tx, id, org, row.actor, row.subject, row.run_id);
					// F1: commit the expired transition + audit, then deny.
					return { refused: new Denied(410, "expired") };
				}
				await audited(
					tx,
					org,
					`tool.approval.${action}`,
					row.actor,
					row.subject,
					row.run_id,
					"",
					{ approval: id, human },
				);
				return { value: undefined };
			},
		);
		if ("refused" in outcome) throw outcome.refused;
	}

	async function claim(
		id: string,
		org: string,
		worker: string,
		recheck: ClaimRecheck,
	): Promise<ClaimedPayload> {
		if (
			!ident128.test(String(id)) ||
			!orgName.test(String(org)) ||
			!ident128.test(String(worker))
		)
			throw new Denied(400, "invalid_context");
		const outcome = await store.transaction(
			async (tx): Promise<Committed<ClaimedPayload>> => {
				const [row] =
					await tx`SELECT *, (expires_at>clock_timestamp()) AS live FROM gw_tool_approval WHERE id=${id} FOR UPDATE`;
				if (!row || row.org !== org) throw new Denied(404, "not_found");
				if (row.state === "pending" || row.state === "approved") {
					// N1: expiry authority is the DB clock, not the app clock.
					if (row.live !== true) {
						await markExpired(tx, id, org, row.actor, row.subject, row.run_id);
						// F1: commit the expired transition + audit, then deny.
						return { refused: new Denied(410, "expired") };
					}
				}
				if (row.state === "pending") throw new Denied(409, "not_approved");
				if (row.state !== "approved") throw new Denied(409, "not_claimable");
				// Shape the DB row into the structural record contextDigest and
				// the recheck callback both consume — the raw postgres Row type
				// carries no column guarantees through to either contract.
				const record = {
					id: row.id,
					org: row.org,
					actor: row.actor,
					subject: row.subject,
					delegation: row.delegation ?? null,
					runId: row.run_id,
					operation: row.operation,
					binding: row.binding,
					requestDigest: row.request_digest,
				};
				const digest = contextDigest(record);
				if (digest !== row.context_digest)
					throw new Denied(500, "integrity_failure");
				let payload: { identity?: FrozenIdentity; args?: unknown };
				try {
					payload = JSON.parse(open(digest, row.envelope));
				} catch {
					throw new Denied(500, "integrity_failure");
				}
				if (
					!payload?.identity ||
					payload.identity.binding !== row.binding ||
					payload.identity.requestDigest !== row.request_digest ||
					payload.identity.operation !== row.operation
				)
					throw new Denied(500, "integrity_failure");
				const allowed = await recheck(tx, record);
				if (allowed !== true) {
					await audited(
						tx,
						org,
						"tool.approval.claim_denied",
						row.actor,
						row.subject,
						row.run_id,
						"",
						{ approval: id, worker },
					);
					// F1: commit the claim_denied audit, then deny outside the tx.
					return { refused: new Denied(403, "claim_denied") };
				}
				const winner =
					await tx`UPDATE gw_tool_approval SET state='dispatching', claimed_at=clock_timestamp(), claimed_by=${worker}, updated_at=clock_timestamp() WHERE id=${id} AND state='approved' AND expires_at>clock_timestamp() RETURNING id`;
				if (!winner.length) {
					// N1: the awaited recheck can cross the deadline mid-tx —
					// the DB-time predicate on this winning UPDATE is the only
					// expiry authority. Persist one expired transition + audit
					// in the SAME tx (committed refusal) and release no
					// payload. A genuine audit failure still rolls back.
					await markExpired(tx, id, org, row.actor, row.subject, row.run_id);
					// F1: commit the expired transition + audit, then deny.
					return { refused: new Denied(410, "expired") };
				}
				await audited(
					tx,
					org,
					"tool.approval.claim",
					row.actor,
					row.subject,
					row.run_id,
					"",
					{ approval: id, worker, externalEffect: "possible" },
				);
				return {
					value: {
						context: {
							org: row.org,
							actor: row.actor,
							subject: row.subject,
							delegation: row.delegation ?? undefined,
							runId: row.run_id,
							request: row.run_id,
							trace: "",
						},
						identity: payload.identity,
						args: payload.args,
					},
				};
			},
		);
		if ("refused" in outcome) throw outcome.refused;
		return outcome.value;
	}

	async function report(
		id: string,
		org: string,
		worker: string,
		outcome: "succeeded" | "failed" | "outcome_unknown",
	) {
		if (!["succeeded", "failed", "outcome_unknown"].includes(outcome))
			throw new Denied(400, "invalid_outcome");
		if (!ident128.test(String(id)) || !orgName.test(String(org)))
			throw new Denied(400, "invalid_context");
		return store.transaction(async (tx) => {
			const [row] =
				await tx`SELECT * FROM gw_tool_approval WHERE id=${id} FOR UPDATE`;
			if (!row || row.org !== org) throw new Denied(404, "not_found");
			// F3: validate the claim owner BEFORE the same-outcome no-op so a
			// foreign worker can never silently ack a terminal row.
			if (row.claimed_by !== worker) throw new Denied(403, "claim_owner");
			if (row.state === outcome) return;
			if (row.state !== "dispatching") throw new Denied(409, "not_reportable");
			await audited(
				tx,
				org,
				`tool.approval.${outcome}`,
				row.actor,
				row.subject,
				row.run_id,
				"",
				outcome === "outcome_unknown"
					? { approval: id, worker, externalEffect: "unknown" }
					: { approval: id, worker },
			);
			await tx`UPDATE gw_tool_approval SET state=${outcome}, updated_at=clock_timestamp() WHERE id=${id} AND state='dispatching'`;
		});
	}

	async function recover() {
		const expiredRows =
			await store.sql`SELECT id,org FROM gw_tool_approval WHERE state IN ('pending','approved') AND expires_at<=clock_timestamp() ORDER BY expires_at LIMIT 64`;
		for (const row of expiredRows)
			await store.transaction(async (tx) => {
				// F2: prove the transition under the row lock (state + DB-time
				// predicate) BEFORE auditing; audit only the row that changed.
				const winner =
					await tx`UPDATE gw_tool_approval SET state='expired', updated_at=clock_timestamp() WHERE id=${row.id} AND state IN ('pending','approved') AND expires_at<=clock_timestamp() RETURNING actor,subject,run_id`;
				if (!winner.length) return;
				await audited(
					tx,
					row.org,
					"tool.approval.expired",
					winner[0].actor,
					winner[0].subject,
					winner[0].run_id,
					"",
					{ approval: row.id },
				);
			});
		const stale =
			await store.sql`SELECT id,org FROM gw_tool_approval WHERE state='dispatching' AND claimed_at+(${bounds.claimLeaseSeconds}*interval '1 second')<=clock_timestamp() ORDER BY claimed_at LIMIT 64`;
		for (const row of stale)
			await store.transaction(async (tx) => {
				// F2: same proof-first shape — a stale candidate that lost the
				// race (row already transitioned) must never gain an audit.
				const winner =
					await tx`UPDATE gw_tool_approval SET state='outcome_unknown', updated_at=clock_timestamp() WHERE id=${row.id} AND state='dispatching' AND claimed_at+(${bounds.claimLeaseSeconds}*interval '1 second')<=clock_timestamp() RETURNING actor,subject,run_id`;
				if (!winner.length) return;
				await audited(
					tx,
					row.org,
					"tool.approval.outcome_unknown",
					winner[0].actor,
					winner[0].subject,
					winner[0].run_id,
					"",
					{ approval: row.id, externalEffect: "unknown", recovered: "true" },
				);
			});
	}

	async function queue(
		org: string,
		opts: { limit?: number; before?: Date } = {},
	) {
		if (!orgName.test(String(org))) throw new Denied(400, "invalid_page");
		const limit = opts.limit ?? 25;
		if (!Number.isInteger(limit) || limit < 1 || limit > 50)
			throw new Denied(400, "invalid_page");
		const rows = await store.sql`
			SELECT id,state,operation,actor,subject,run_id,projection,created_at,expires_at
			FROM gw_tool_approval
			WHERE org=${org} AND state IN ('pending','approved')
				${opts.before ? store.sql`AND created_at < ${opts.before}` : store.sql``}
			ORDER BY created_at DESC
			LIMIT ${limit + 1}`;
		const page = rows.slice(0, limit);
		return {
			rows: page,
			next:
				rows.length > limit
					? new Date(page[page.length - 1].created_at)
					: undefined,
		};
	}

	async function detail(org: string, id: string) {
		if (!orgName.test(String(org)) || !ident128.test(String(id)))
			throw new Denied(400, "invalid_context");
		const [row] = await store.sql`
			SELECT id,state,operation,actor,subject,delegation,run_id,projection,created_at,expires_at,decided_by,decided_at,claimed_by,claimed_at
			FROM gw_tool_approval WHERE id=${id} AND org=${org}`;
		if (!row) throw new Denied(404, "not_found");
		return row;
	}

	return Object.freeze({
		enqueue,
		decide,
		claim,
		report,
		recover,
		queue,
		detail,
	});
}
