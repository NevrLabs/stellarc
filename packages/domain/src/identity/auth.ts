import { createHash, timingSafeEqual } from "node:crypto";
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

function constantTimeEquals(a: string, b: string): boolean {
	const ab = Buffer.from(a, "utf8");
	const bb = Buffer.from(b, "utf8");
	if (ab.length !== bb.length) return false;
	return timingSafeEqual(ab, bb);
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
}

interface KeyRow {
	id: string;
	reference_id: string;
	permissions: string | null;
	enabled: boolean | null;
	expires_at: Date | string | null;
}

function isExpired(value: Date | string | null, now: Date): boolean {
	if (!value) return false;
	const t = value instanceof Date ? value.getTime() : Date.parse(value);
	return Number.isNaN(t) ? false : t <= now.getTime();
}

/** Constant-time digest lookup of a raw key. Disabled/expired keys are denied
 * before any scope derivation. Returns null on any failure (T04/T05). */
export async function authenticateApiKey(
	sql: Sql,
	rawKey: string,
): Promise<ApiKeyAuth | null> {
	if (!rawKey || rawKey.length > 4096) return null;
	const digest = apiKeyDigest(rawKey);
	const rows = await sql<KeyRow[]>`
		SELECT id, reference_id, permissions, enabled, expires_at
		FROM apikey WHERE "key" = ${digest} LIMIT 2`;
	if (rows.length !== 1) return null;
	const key = rows[0];
	if (!key) return null;
	// The indexed equality found the candidate; re-verify the digest in
	// constant time so a comparison oracle cannot shortcut authentication.
	if (!constantTimeEquals(digest, apiKeyDigest(rawKey))) return null;
	if (key.enabled === false) return null;
	if (isExpired(key.expires_at, new Date())) return null;

	const now = new Date();
	const principalId = agentPrincipalId(key.id);
	// Provision the agent principal + org-scoped grants derived from the key's
	// owner membership (T06). ON CONFLICT keeps re-authentication idempotent.
	await sql.begin(async (tx) => {
		const [ownerExists] =
			await tx`SELECT 1 FROM "user" WHERE id = ${key.reference_id}`;
		if (!ownerExists) return;
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
		void now;
	});

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
	};
}
