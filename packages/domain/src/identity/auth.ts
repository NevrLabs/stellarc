import { createHash } from "node:crypto";
export const AUTH_IMPL_VERSION = "AUTHIMPL_v2_ATOMIC";

import type { Sql } from "postgres";

/** STL-15 §3: digest = base64url(SHA-256(UTF8(rawKey))), unpadded. */
export function apiKeyDigest(rawKey: string): string {
	return createHash("sha256").update(rawKey, "utf8").digest("base64url");
}

/** Human principal IDs derive stably from user IDs (§2); agent IDs live in a
 * separate namespace derived from API-key IDs, so the two can never collide. */
export function humanPrincipalId(userId: string): string {
	return `human:${userId}`;
}

export function agentPrincipalId(apikeyId: string): string {
	return `agent:${apikeyId}`;
}

export interface ApiKeyAuth {
	readonly key: {
		readonly id: string;
		readonly referenceId: string;
		readonly permissions: string | null;
		readonly enabled: boolean | null;
	};
	/** The (existing or freshly provisioned) agent principal for this key. */
	readonly principal: {
		readonly id: string;
		readonly kind: "agent";
		readonly userId: string;
	};
	/** Orgs whose membership rows reference the owning user (key scope). */
	readonly orgIds: readonly string[];
	/** Parsed permission ceiling (§2: agent capability ∩ ceiling). */
	readonly keyCeiling: Readonly<Record<string, readonly string[]>> | null;
}

interface KeyRow {
	id: string;
	reference_id: string;
	permissions: string | null;
	enabled: boolean | null;
	expires_at: Date | string | null;
	rate_limit_enabled: boolean | null;
	rate_limit_time_window: number | null;
	rate_limit_max: number | null;
	request_count: number | null;
	remaining: number | null;
	last_request?: Date | string | null;
	refill_interval?: number | null;
	refill_amount?: number | null;
	owner_banned?: boolean | null;
}

function parseCeiling(
	permissions: string | null,
): Readonly<Record<string, readonly string[]>> | null {
	if (permissions === null || permissions === undefined) return null;
	try {
		const parsed: unknown = JSON.parse(permissions);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			const out: Record<string, readonly string[]> = {};
			for (const [resource, actions] of Object.entries(
				parsed as Record<string, unknown>,
			)) {
				if (!Array.isArray(actions)) continue;
				out[resource] = actions.filter(
					(a): a is string => typeof a === "string",
				);
			}
			return out;
		}
		return null;
	} catch {
		return null;
	}
}

function isExpired(value: Date | string | null, now: Date): boolean {
	if (!value) return false;
	const t = value instanceof Date ? value.getTime() : Date.parse(value);
	return Number.isNaN(t) ? false : t <= now.getTime();
}

/** Authenticate a raw API key. The indexed equality on the stored digest is
 * the comparison (base64url hex-free SHA-256, constant-time by construction
 * over the b-tree lookup); disabled/expired/rate-exhausted keys are denied
 * before any scope derivation (T04/T05). Rate counters are enforced with a
 * single conditional UPDATE inside the provisioning transaction, so concurrent
 * calls serialize on the row lock and can never exceed the limit. Returns
 * null on any failure. */
export async function authenticateApiKey(
	sql: Sql,
	rawKey: string,
): Promise<ApiKeyAuth | null> {
	if (!rawKey || rawKey.length > 4096) return null;
	const digest = apiKeyDigest(rawKey);
	const now = new Date();
	type KeyRowJoined = KeyRow & {
		owner_banned: boolean | null;
		refill_interval: number | null;
		refill_amount: number | null;
	};
	const rows = await sql<KeyRowJoined[]>`
		SELECT k.id, k.reference_id, k.permissions, k.enabled, k.expires_at,
			k.rate_limit_enabled, k.rate_limit_time_window, k.rate_limit_max,
			k.request_count, k.remaining, k.refill_interval, k.refill_amount,
			u.banned AS owner_banned
		FROM apikey k JOIN "user" u ON u.id = k.reference_id
		WHERE k."key" = ${digest} LIMIT 2`;
	if (rows.length !== 1) return null;
	const key = rows[0];
	if (!key) return null;
	if (key.enabled === false) return null;
	if (isExpired(key.expires_at, now)) return null;
	// D3 (review c3): banned owners deny the key path just like the session
	// path — the join makes the owner's ban state visible here.
	if (key.owner_banned === true) return null;

	const principalId = agentPrincipalId(key.id);
	let provisioned = false;
	await sql.begin(async (tx) => {
		const [ownerExists] =
			await tx`SELECT 1 FROM "user" WHERE id = ${key.reference_id}`;
		if (!ownerExists) return;
		const windowMs = key.rate_limit_time_window ?? 86_400_000;
		const windowStart = new Date(now.getTime() - windowMs).toISOString();
		// D3 refill semantics: when refill_interval (seconds) has elapsed
		// since the last request, refill_amount (when finite) restores
		// capacity instead of a bare -1 decrement.
		const refillMs = (key.refill_interval ?? 0) * 1000;
		const refillDue =
			key.refill_amount !== null &&
			key.refill_amount !== undefined &&
			refillMs > 0;
		const refillCap =
			key.rate_limit_max !== null && key.rate_limit_max !== undefined
				? key.rate_limit_max
				: null;
		// Atomic rate gate: the row lock taken by the matched UPDATE serializes
		// concurrent authentications; a key at its limit updates zero rows and
		// the caller is denied below (T05, negative control: unlocked increment).
		// Window semantics live entirely in SQL: request_count resets when the
		// last request is older than the window, remaining (when finite) must
		// stay positive, and NULL rate_limit_max means no request ceiling.
		const updated = await tx`
			UPDATE apikey SET
				request_count = CASE
					WHEN last_request IS NOT NULL AND last_request < ${windowStart} THEN 1
					ELSE request_count + 1 END,
				remaining = CASE
					WHEN remaining IS NULL THEN NULL
					WHEN ${refillDue} AND last_refill_at IS NOT NULL
						AND last_refill_at < ${new Date(now.getTime() - refillMs).toISOString()} THEN
						CASE WHEN ${refillCap}::int IS NULL THEN NULL
							ELSE LEAST(${refillCap}::int, remaining + ${key.refill_amount ?? 0}) END
					WHEN remaining > 0 THEN remaining - 1
					ELSE 0 END,
				last_refill_at = CASE
					WHEN ${refillDue} AND (last_refill_at IS NULL OR last_refill_at < ${new Date(now.getTime() - refillMs).toISOString()}) THEN ${now.toISOString()}
					ELSE last_refill_at END,
				last_request = ${now.toISOString()},
				updated_at = ${now.toISOString()}
			WHERE id = ${key.id}
				AND (remaining IS NULL OR remaining > 0)
				AND (
					rate_limit_max IS NULL
					OR request_count < rate_limit_max
					OR (last_request IS NOT NULL AND last_request < ${windowStart})
				)
			RETURNING id`;
		if (updated.length === 0) return;
		await tx`INSERT INTO principal (id, kind, user_id, apikey_id)
			VALUES (${principalId}, 'agent', ${key.reference_id}, ${key.id})
			ON CONFLICT (id) DO NOTHING`;
		const scopes = await tx<{ organization_id: string }[]>`
			SELECT organization_id FROM organization_member
			WHERE user_id = ${key.reference_id}`;
		for (const scope of scopes) {
			await tx`INSERT INTO identity_grant (org_id, principal_id, capability)
				VALUES (${scope.organization_id}, ${principalId}, 'org:member')
				ON CONFLICT (org_id, principal_id, capability) DO NOTHING`;
			if (key.permissions) {
				let parsed: unknown;
				try {
					parsed = JSON.parse(key.permissions);
				} catch {
					continue;
				}
				if (parsed && typeof parsed === "object") {
					for (const [resource, actions] of Object.entries(
						parsed as Record<string, unknown>,
					)) {
						if (!Array.isArray(actions)) continue;
						for (const action of actions) {
							if (typeof action !== "string") continue;
							await tx`INSERT INTO identity_grant (org_id, principal_id, capability)
								VALUES (${scope.organization_id}, ${principalId}, ${`${resource}:${action}`})
								ON CONFLICT (org_id, principal_id, capability) DO NOTHING`;
						}
					}
				}
			}
		}
		provisioned = true;
	});

	if (!provisioned) return null;

	const orgIds = await sql<{ organization_id: string }[]>`
		SELECT organization_id FROM organization_member WHERE user_id = ${key.reference_id}`;
	return {
		key: {
			id: key.id,
			referenceId: key.reference_id,
			permissions: key.permissions,
			enabled: key.enabled,
		},
		principal: {
			id: principalId,
			kind: "agent",
			userId: key.reference_id,
		},
		orgIds: orgIds.map((row) => row.organization_id),
		keyCeiling: parseCeiling(key.permissions),
	};
}
