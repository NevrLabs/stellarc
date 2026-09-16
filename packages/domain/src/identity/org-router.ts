import type { Sql } from "postgres";
import type { IdentityError } from "../../../contracts/src/identity/http";

// STL-15 §2: single-schema OrgRouter seam. resolve(orgId) accepts IDs, never
// SQL schema names; every scoped query still binds organization_id. Existence
// and caller membership are verified fail-closed before the binding returns.

export interface OrgBinding {
	readonly schema: "public";
	readonly orgId: string;
}

export type OrgRouterError = Extract<
	IdentityError,
	{ _tag: "NotFound" | "Forbidden" | "Unauthenticated" }
>;

/** Resolve org with membership check. `callerUserId` is the authenticated
 * human user (Unauthenticated when absent); agents resolve through their
 * owning user upstream. */
export async function orgRouter(
	sql: Sql,
	callerUserId: string | null,
	orgId: string,
): Promise<OrgBinding> {
	if (!callerUserId) {
		const unauthenticated: OrgRouterError = { _tag: "Unauthenticated" };
		throw unauthenticated;
	}
	if (!orgId || orgId.length > 128) {
		// Same 404 as absent entities (§3): no oracle for malformed IDs.
		// Injection safety comes from parameter binding below (never
		// interpolation), not from value filtering (T08 negative control).
		const notFound: OrgRouterError = { _tag: "NotFound" };
		throw notFound;
	}
	const [org] = await sql`SELECT id FROM organization WHERE id = ${orgId}`;
	if (!org) {
		const notFound: OrgRouterError = { _tag: "NotFound" };
		throw notFound;
	}
	const [member] =
		await sql`SELECT 1 FROM organization_member WHERE organization_id = ${orgId} AND user_id = ${callerUserId}`;
	if (!member) {
		const forbidden: OrgRouterError = { _tag: "Forbidden" };
		throw forbidden;
	}
	return { schema: "public", orgId };
}
