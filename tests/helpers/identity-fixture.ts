import type { Sql } from "postgres";
import { runMigration } from "../../packages/db/src/migrate";
import { disposablePostgres } from "./postgres";

// STL-15 §5 manifest: shared fixture source for import tests (T23–T25) and
// e2e. One fresh migrated source DB per fixture; seeds a coherent ten-table
// snapshot (users/org/members/roles/teams/keys/avatar) with FK-valid rows.
// Secrets are deterministic test values only.

export interface IdentityFixture {
	sql: Sql;
	close: () => Promise<void>;
}

export async function identityFixtureSource(
	name: string,
): Promise<IdentityFixture> {
	const db = await disposablePostgres();
	await runMigration(db.sql);
	return { sql: db.sql, close: db.close };
}

/** A clean minimal base: one user, one org, one owner member row. */
export async function seedIdentityBase(s: Sql): Promise<void> {
	await s`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES ('u-fx', 'Fixture Owner', 'owner@fixture.test', true, '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	await s`INSERT INTO organization (id, name, slug, repos_enabled, tables_enabled, work_enabled,
		default_resource_privilege, ai_enabled, ai_default_token_limit, ai_default_character_limit, created_at)
		VALUES ('o-fx', 'Fixture Org', 'fixture-org', false, false, false, 'manage', false, 1024, 4000, '2025-06-01 10:00:00')`;
	await s`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('m-fx', 'o-fx', 'u-fx', 'owner', '2025-06-01 10:00:00')`;
}

/** The full ten-table coherent snapshot (used by T23 all-column checks). */
export async function seedIdentitySnapshot(s: Sql): Promise<void> {
	await seedIdentityBase(s);
	await s`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES ('u-fx2', 'Fixture Member', 'member@fixture.test', true, '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	await s`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
		VALUES ('a-fx', 'a-fx', 'credential', 'u-fx', '$2a$10$K7L1OJgMCVYYnSMOYYVY7OYcP9KK1e5wGwW1gEMV2GWnIVRpwdEVe', '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	await s`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('m-fx2', 'o-fx', 'u-fx2', 'member', '2025-06-01 10:00:00')`;
	await s`INSERT INTO organization_role (id, organization_id, role, permission, created_at, updated_at)
		VALUES ('r-fx', 'o-fx', 'viewer', ${JSON.stringify({ organization: ["read"] })}, '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	await s`INSERT INTO team (id, name, organization_id, source, icon, parent_team_id, created_at, updated_at)
		VALUES ('t-fx', 'Fixture Team', 'o-fx', 'kaneo', 'default-icon', null, '2025-06-01 10:00:00', null)`;
	await s`INSERT INTO team (id, name, organization_id, source, icon, parent_team_id, created_at, updated_at)
		VALUES ('t-fx2', 'Fixture Subteam', 'o-fx', 'kaneo', null, 't-fx', '2025-06-01 10:00:00', null)`;
	await s`INSERT INTO team_member (id, team_id, user_id, created_at)
		VALUES ('tm-fx', 't-fx', 'u-fx2', '2025-06-01 10:00:00')`;
	await s`INSERT INTO invitation (id, organization_id, email, role, team_id, status, expires_at, created_at, inviter_id)
		VALUES ('i-fx', 'o-fx', 'pending@fixture.test', 'member', 't-fx', 'pending', '2026-12-31 00:00:00', '2025-06-01 10:00:00', 'u-fx')`;
	await s`INSERT INTO apikey (id, config_id, name, reference_id, "key", created_at, updated_at)
		VALUES ('k-fx', 'default', 'fixture-key', 'u-fx', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	await s`INSERT INTO user_avatar (id, user_id, mime_type, size, data, created_at, updated_at)
		VALUES ('av-fx', 'u-fx', 'image/png', 4, '\\x00112233', '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
}

export { fixtureSourceId } from "../../packages/domain/src/identity/import";
