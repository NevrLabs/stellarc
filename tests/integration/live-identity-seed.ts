// Live-mode test double for the merged STL-15 identity importer.
//
// The real importer (packages/domain/src/identity/import.ts) is not merged at
// this point; live-mode tests inject THIS module through the runner's
// `liveIdentityTarget` seam. It satisfies the LegacyIdentityImporter contract
// exactly: given the restored legacy snapshot (schema `legacy`) and a T0+
// destination (schema `public`, merged migrations applied), it materializes a
// CORRECT identity import — PKs preserved verbatim (STL-15 §2), hashes verbatim,
// ledger rows for every imported identity row.
//
// NOTE: @effect/sql statements are Effects, not promises — awaiting one is a
// no-op. Every statement is therefore executed with Effect.runPromise.

import type { PgClient } from "@effect/sql-pg";
import { Effect } from "effect";
import {
	hashApiKey,
	KNOWN_ANSWER_RAWS,
} from "../../tools/reconciliation/canon";

export async function importLegacyIdentityFixture(
	sql: PgClient.PgClient,
): Promise<void> {
	await Effect.runPromise(
		Effect.gen(function* () {
			// idempotent re-import: remove the rows this fixture is about to write so
			// a second live run over an already-imported destination is a no-op
			// (real importers upsert by source_pk).
			yield* sql.unsafe(`
-- the import replaces the destination identity ledger wholesale
DELETE FROM public.identity_import;
DELETE FROM public.identity_grant WHERE org_id = 'o1' AND principal_id IN ('p1','p2');
DELETE FROM public.principal WHERE id IN ('p1','p2');
DELETE FROM public.apikey WHERE id IN ('k1','k2');
DELETE FROM public.user_avatar WHERE id = 'av1';
DELETE FROM public.invitation WHERE id = 'inv1';
DELETE FROM public.team_member WHERE id IN ('tm1','tm2');
DELETE FROM public.team WHERE id IN ('t1','t2');
DELETE FROM public.organization_role WHERE id = 'r1';
DELETE FROM public.organization_member WHERE id IN ('m1','m2');
DELETE FROM public.organization WHERE id IN ('o1','o2');
DELETE FROM public.account WHERE id = 'a1';
DELETE FROM public."user" WHERE id IN ('u1','u2');
`);
			// destination identity rows imported from the snapshot (PKs preserved);
			// defaulted columns are set explicitly so 0002 defaults never fire —
			// a correct import copies legacy values (incl. NULLs) verbatim.
			yield* sql.unsafe(`
INSERT INTO public."user" (id, name, email, email_verified, image, locale, is_anonymous, role, banned, ban_reason, ban_expires, created_at, updated_at) VALUES
  ('u1','Alice','a@x.com',true,NULL,NULL,NULL,'admin',true,'abuse','2026-06-01T00:00:00Z','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),
  ('u2','Bob','b@x.com',true,NULL,NULL,NULL,'admin',NULL,NULL,NULL,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
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
INSERT INTO public.team (id, name, organization_id, created_at) VALUES
  ('t1','Team A','o1','2026-01-01T00:00:00Z'), ('t2','Team B','o2','2026-01-01T00:00:00Z');
INSERT INTO public.team_member (id, team_id, user_id, created_at) VALUES
  ('tm1','t1','u1',NULL), ('tm2','t2','u2',NULL);
INSERT INTO public.invitation (id, organization_id, email, status, inviter_id, expires_at, created_at) VALUES
  ('inv1','o1','c@x.com','pending','u1','2027-01-01T00:00:00Z','2026-01-01T00:00:00Z');
INSERT INTO public.user_avatar (id, user_id, mime_type, size, data, created_at, updated_at) VALUES
  ('av1','u1','image/png',4,decode('89504e47','hex'),'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
`);
			// apikeys preserve the fork hash verbatim (query #14 arm (a))
			yield* sql.unsafe(
				`INSERT INTO public.apikey (id, name, reference_id, prefix, "key", enabled, rate_limit_enabled, permissions, created_at, updated_at) VALUES
  ('k1','key-1','u1','sk-a','${hashApiKey(KNOWN_ANSWER_RAWS[0])}',true,true,'{"*":["*"]}','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),
  ('k2','key-2','u2','sk-b','${hashApiKey(KNOWN_ANSWER_RAWS[1])}',true,true,'{"*":["*"]}','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');`,
			);
			// principals + grants per the identity contracts
			yield* sql.unsafe(`
INSERT INTO public.principal (id, kind, user_id, apikey_id) VALUES
  ('p1','human','u1',NULL), ('p2','agent','u1','k2');
INSERT INTO public.identity_grant (org_id, principal_id, capability) VALUES
  ('o1','p1','manage');
`);
			// the ledger: one row per imported identity row (query #13 bijection)
			yield* sql.unsafe(`
INSERT INTO public.identity_import (source_id, table_name, source_pk, digest) VALUES
  ('live-1','user','u1','d1'), ('live-1','user','u2','d2'),
  ('live-1','account','a1','d3'),
  ('live-1','organization','o1','d4'), ('live-1','organization','o2','d5'),
  ('live-1','organization_member','m1','d6'), ('live-1','organization_member','m2','d7'),
  ('live-1','organization_role','r1','d8');
`);
		}),
	);
}

/**
 * A detected-but-no-op importer: models a second harness run where the importer
 * has already completed and must not rewrite destination state. lets the
 * negative control reconcile a destination it did not just import.
 */
export async function importNoopIdentity(_sql: unknown): Promise<void> {}
