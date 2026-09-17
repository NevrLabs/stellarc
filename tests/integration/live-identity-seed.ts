// Live-mode test double for the merged STL-15 identity importer.
//
// The real importer (packages/domain/src/identity/import.ts) is not merged at
// this point; live-mode tests inject THIS module through the runner's
// `liveIdentityTarget` seam. It satisfies the LegacyIdentityImporter contract
// exactly: given the restored legacy snapshot (schema `legacy`) and a T0+
// destination (schema `public`, merged migrations applied), it materializes a
// CORRECT identity import — PKs preserved verbatim (STL-15 §2), hashes verbatim,
// ledger rows for every imported identity row.
import type { PgClient } from "@effect/sql-pg";
import {
	hashApiKey,
	KNOWN_ANSWER_RAWS,
} from "../../tools/reconciliation/canon";

export async function importLegacyIdentityFixture(
	sql: PgClient.PgClient,
): Promise<void> {
	// destination identity rows imported from the snapshot (PKs preserved)
	await sql.unsafe(`
INSERT INTO public."user" (id, name, email, email_verified, role, created_at, updated_at) VALUES
  ('u1','Alice','a@x.com',true,'admin','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),
  ('u2','Bob','b@x.com',true,'admin','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
INSERT INTO public.account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES
  ('a1','cred-1','credential','u1','bcrypt-hash-1','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
INSERT INTO public.organization (id, name, slug, work_enabled, created_at) VALUES
  ('o1','Org A','org-a',false,'2026-01-01T00:00:00Z'),
  ('o2','Org B','org-b',false,'2026-01-01T00:00:00Z');
INSERT INTO public.organization_member (id, organization_id, user_id, role, joined_at) VALUES
  ('m1','o1','u1','owner','2026-01-02T00:00:00Z'),
  ('m2','o2','u2','owner','2026-01-02T00:00:00Z');
INSERT INTO public.organization_role (id, organization_id, role, permission, created_at, updated_at) VALUES
  ('r1','o1','owner','{}','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
`);
	// apikeys preserve the fork hash verbatim (query #14 arm (a))
	await sql.unsafe(
		`INSERT INTO public.apikey (id, name, reference_id, prefix, "key", enabled, rate_limit_enabled, permissions, created_at, updated_at) VALUES
  ('k1','key-1','u1','sk-a','${hashApiKey(KNOWN_ANSWER_RAWS[0])}',true,true,'{"*":["*"]}','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),
  ('k2','key-2','u2','sk-b','${hashApiKey(KNOWN_ANSWER_RAWS[1])}',true,true,'{"*":["*"]}','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');`,
	);
	// principals + grants per the identity contracts
	await sql.unsafe(`
INSERT INTO public.principal (id, kind, user_id, apikey_id) VALUES
  ('p1','human','u1',NULL), ('p2','agent','u1','k2');
INSERT INTO public.identity_grant (org_id, principal_id, capability) VALUES
  ('o1','p1','manage');
`);
	// the ledger: one row per imported identity row (query #13 bijection)
	await sql.unsafe(`
INSERT INTO public.identity_import (source_id, table_name, source_pk, digest) VALUES
  ('live-1','user','u1','d1'), ('live-1','user','u2','d2'),
  ('live-1','account','a1','d3'),
  ('live-1','organization','o1','d4'), ('live-1','organization','o2','d5'),
  ('live-1','organization_member','m1','d6'), ('live-1','organization_member','m2','d7'),
  ('live-1','organization_role','r1','d8');
`);
}
