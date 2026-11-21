import type { Sql, TransactionSql } from "postgres";
import { Forbidden } from "../../agents/src/errors";

/** Current org admission, not a kill switch. In a transaction the activation
 * lock is held through the winning transition. Take it before task/event
 * locks: deactivate and manifest narrowing lock activation before appending.
 * The manifest join is deliberately unlocked; install narrows the activation
 * in the same transaction. A stale manifest can refuse, never add a grant.
 * ponytail: no bounded deactivation latency under concurrent admissions;
 * add a per-org admission fence if a bounded stop becomes a requirement. */
export async function requireAppAccess(
	sql: Sql | TransactionSql,
	org: string,
	appId: string,
	capability?: string,
) {
	const [row] = await sql<{ capabilities: string[]; asked: string[] }[]>`
		SELECT v.capabilities, a.manifest->'capabilities' AS asked
		FROM app_activation v JOIN app a ON a.id = v.app_id
		WHERE v.org = ${org} AND v.app_id = ${appId}
		FOR SHARE OF v`;
	if (
		!row ||
		(capability !== undefined &&
			(!row.capabilities.includes(capability) ||
				!row.asked.includes(capability)))
	)
		throw new Forbidden({
			message: "App is inactive or capability not granted",
		});
}
