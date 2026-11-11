import type { Sql } from "postgres";

export async function bindIdentity(
	sql: Sql,
	issuer: string,
	client: string,
	initialize = false,
) {
	if (initialize) {
		await sql`CREATE TABLE IF NOT EXISTS gw_identity_binding(singleton boolean PRIMARY KEY CHECK(singleton),issuer text NOT NULL,client text NOT NULL)`;
		await sql`INSERT INTO gw_identity_binding VALUES (true,${issuer},${client}) ON CONFLICT DO NOTHING`;
	}
	const rows = await sql`SELECT issuer,client FROM gw_identity_binding`;
	if (
		rows.length !== 1 ||
		rows[0].issuer !== issuer ||
		rows[0].client !== client
	)
		throw new Error("Installation OIDC binding mismatch");
}

// Evaluate effective privileges as the actual runtime login, not the owner CLI.
export async function assertRuntimeDatabase(sql: Sql) {
	const [role] = await sql`
  SELECT r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication
   OR EXISTS (SELECT 1 FROM pg_roles parent WHERE parent.oid<>r.oid AND pg_has_role(r.oid,parent.oid,'MEMBER'))
   OR EXISTS (SELECT 1 FROM pg_database d WHERE d.datname=current_database() AND pg_has_role(r.oid,d.datdba,'MEMBER'))
   OR has_database_privilege(current_user,current_database(),'CREATE')
   OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND has_schema_privilege(current_user,n.oid,'CREATE'))
   OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND pg_has_role(r.oid,c.relowner,'MEMBER'))
   OR has_table_privilege(current_user,'public.gw_audit','UPDATE,DELETE,TRUNCATE,TRIGGER')
   OR has_any_column_privilege(current_user,'public.gw_audit','UPDATE')
   OR EXISTS (SELECT 1 FROM (VALUES ('public.gw_identity_binding'),('public.gw_installation')) immutable(name)
    WHERE has_table_privilege(current_user,immutable.name,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
     OR has_any_column_privilege(current_user,immutable.name,'INSERT,UPDATE'))
   OR current_schemas(false) <> ARRAY['public']::name[]
   OR EXISTS (SELECT 1 FROM unnest(current_schemas(true)) s WHERE s LIKE 'pg_temp_%') AS unsafe
  FROM pg_roles r WHERE r.rolname=current_user`;
	if (!role || role.unsafe)
		throw new Error("Unsafe candidate runtime database privileges");
}
